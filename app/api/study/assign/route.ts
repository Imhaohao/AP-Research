import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { armIndexFromParticipantSequence, studyGroupSlugFromArm } from '@/lib/studyArms';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function isRpcMissingError(error: { code?: string; message?: string }): boolean {
  return (
    error.code === 'PGRST202' ||
    /could not find the function public\.claim_next_participant_sequence/i.test(error.message ?? '')
  );
}

/**
 * Approximate order: next sequence ≈ current row count + 1 (not atomic under concurrency).
 */
async function assignFromRowCount(supabase: SupabaseClient, warning: string) {
  const { count, error: countErr } = await supabase
    .from('study_results')
    .select('*', { count: 'exact', head: true });

  if (countErr) {
    return NextResponse.json({ error: countErr.message }, { status: 500 });
  }

  const seq = (count ?? 0) + 1;
  const treatmentArm = armIndexFromParticipantSequence(seq);
  return NextResponse.json({
    participant_sequence: null,
    treatment_arm: treatmentArm,
    study_group: studyGroupSlugFromArm(treatmentArm),
    warning,
  });
}

/**
 * Returns the next systematic assignment: seq = 1,2,3,… arm = (seq-1) % 3.
 * Prefer SUPABASE_SERVICE_ROLE_KEY so claim_next_participant_sequence() is atomic.
 */
export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || (!serviceKey && !anonKey)) {
    return NextResponse.json(
      { error: 'Supabase not configured' },
      { status: 503 }
    );
  }

  if (serviceKey) {
    const supabase = createClient(url, serviceKey);
    const { data, error } = await supabase.rpc('claim_next_participant_sequence');
    if (error) {
      if (isRpcMissingError(error)) {
        console.warn(
          'assign: claim_next_participant_sequence not in DB; falling back to row count. Run supabase/three_arm_assignment.sql in Supabase SQL Editor.'
        );
        return assignFromRowCount(
          supabase,
          'Approximate assignment (row count): RPC claim_next_participant_sequence is not installed. Open Supabase → SQL Editor → run supabase/three_arm_assignment.sql, then reload.'
        );
      }
      console.error('assign rpc error:', error);
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }
    const seq = typeof data === 'number' ? data : Number(data);
    if (!Number.isFinite(seq) || seq < 1) {
      return NextResponse.json({ error: 'Invalid sequence from database' }, { status: 500 });
    }
    const treatmentArm = armIndexFromParticipantSequence(seq);
    return NextResponse.json({
      participant_sequence: seq,
      treatment_arm: treatmentArm,
      study_group: studyGroupSlugFromArm(treatmentArm),
    });
  }

  if (!anonKey) {
    return NextResponse.json({ error: 'Supabase anon key required for assignment without service role' }, { status: 503 });
  }
  const supabase = createClient(url, anonKey);
  return assignFromRowCount(
    supabase,
    'Approximate assignment (row count). For atomic order, set SUPABASE_SERVICE_ROLE_KEY and run supabase/three_arm_assignment.sql.'
  );
}
