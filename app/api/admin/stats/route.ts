import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

function getExpectedAdminCode(): string {
  return process.env.ADMIN_ACCESS_CODE || 'Triangle123!.';
}

function isAuthorized(request: NextRequest): boolean {
  const code = request.headers.get('x-admin-code') || '';
  return code === getExpectedAdminCode();
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    return NextResponse.json({ error: 'Supabase is not configured.' }, { status: 503 });
  }

  const supabase = createClient(url, serviceRoleKey);

  const [{ data: participants, error: participantsErr }, { data: results, error: resultsErr }] =
    await Promise.all([
      supabase
        .from('study_participants')
        .select('grade,availability_label,likert,created_at,email'),
      supabase
        .from('study_results')
        .select('study_group,lottery_opt_in,created_at'),
    ]);

  if (participantsErr) {
    return NextResponse.json({ error: participantsErr.message }, { status: 500 });
  }
  if (resultsErr) {
    return NextResponse.json({ error: resultsErr.message }, { status: 500 });
  }

  const gradeBreakdown: Record<string, number> = {};
  const availabilityBreakdown: Record<string, number> = {};
  const likertAverages: Record<string, { total: number; count: number; average: number }> = {};

  for (const p of participants ?? []) {
    const grade = p.grade || 'Unknown';
    const availability = p.availability_label || 'unknown';
    gradeBreakdown[grade] = (gradeBreakdown[grade] ?? 0) + 1;
    availabilityBreakdown[availability] = (availabilityBreakdown[availability] ?? 0) + 1;

    const likert = (p.likert ?? {}) as Record<string, unknown>;
    for (const [key, value] of Object.entries(likert)) {
      if (typeof value !== 'number' || Number.isNaN(value)) continue;
      if (!likertAverages[key]) {
        likertAverages[key] = { total: 0, count: 0, average: 0 };
      }
      likertAverages[key].total += value;
      likertAverages[key].count += 1;
    }
  }

  for (const key of Object.keys(likertAverages)) {
    const entry = likertAverages[key];
    entry.average = entry.count > 0 ? Number((entry.total / entry.count).toFixed(2)) : 0;
  }

  const studyGroupBreakdown: Record<string, number> = {};
  let lotteryYes = 0;
  let lotteryNo = 0;
  let lotteryUnknown = 0;
  let submissionsLast7d = 0;

  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  for (const r of results ?? []) {
    const group = r.study_group || 'unknown';
    studyGroupBreakdown[group] = (studyGroupBreakdown[group] ?? 0) + 1;
    if (r.lottery_opt_in === true) lotteryYes += 1;
    else if (r.lottery_opt_in === false) lotteryNo += 1;
    else lotteryUnknown += 1;

    if (r.created_at && new Date(r.created_at) >= sevenDaysAgo) {
      submissionsLast7d += 1;
    }
  }

  return NextResponse.json({
    participants_total: participants?.length ?? 0,
    results_total: results?.length ?? 0,
    submissions_last_7_days: submissionsLast7d,
    grade_breakdown: gradeBreakdown,
    availability_breakdown: availabilityBreakdown,
    study_group_breakdown: studyGroupBreakdown,
    lottery_breakdown: {
      yes: lotteryYes,
      no: lotteryNo,
      unknown: lotteryUnknown,
    },
    likert_averages: likertAverages,
  });
}
