import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { notifyDatabaseChange } from '@/lib/dbChangeAlerts';

const STUDY_GROUPS = [
  'control',
  'treatment',
  'unrestricted_ai',
  'guided_ai',
  'prompt_bank_ai',
] as const;

type StudyGroup = (typeof STUDY_GROUPS)[number];

type SubmitBody = {
  client_submission_id: string;
  study_group: StudyGroup;
  treatment_arm?: number | null;
  participant_sequence?: number | null;
  data: Record<string, unknown>;
};

function isMissingColumnError(error: { code?: string; message?: string }): boolean {
  // PostgREST schema-cache mismatch / missing column errors look like:
  // code: PGRST204, message: "Could not find the 'treatment_arm' column of 'study_results' in the schema cache"
  return (
    error.code === 'PGRST204' ||
    /could not find the '.*' column of 'study_results' in the schema cache/i.test(error.message ?? '')
  );
}

export async function POST(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    return NextResponse.json(
      { error: 'Supabase is not configured (NEXT_PUBLIC_SUPABASE_URL and key)' },
      { status: 503 }
    );
  }

  let body: SubmitBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { client_submission_id, study_group, treatment_arm, participant_sequence, data } = body;
  if (
    typeof client_submission_id !== 'string' ||
    !client_submission_id ||
    !STUDY_GROUPS.includes(study_group as StudyGroup) ||
    data === null ||
    typeof data !== 'object'
  ) {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  const supabase = createClient(url, key);
  const now = new Date().toISOString();
  const participantEmail =
    typeof data.participant_email === 'string'
      ? data.participant_email.trim() || null
      : null;
  const participantLoginId =
    typeof data.participant_login_id === 'string'
      ? data.participant_login_id.trim().toUpperCase() || null
      : null;
  const lotteryOptIn =
    typeof data.lottery_opt_in === 'boolean'
      ? data.lottery_opt_in
      : null;

  const row: Record<string, unknown> = {
    client_submission_id,
    study_group,
    data,
    updated_at: now,
    participant_email: participantEmail,
    participant_login_id: participantLoginId,
    lottery_opt_in: lotteryOptIn,
  };
  if (treatment_arm !== undefined && treatment_arm !== null) {
    row.treatment_arm = treatment_arm;
  }
  if (participant_sequence !== undefined && participant_sequence !== null) {
    row.participant_sequence = participant_sequence;
  }

  const baseRow: Record<string, unknown> = {
    client_submission_id,
    study_group,
    data,
    updated_at: now,
  };

  const { error } = await supabase.from('study_results').upsert(row, { onConflict: 'client_submission_id' });

  if (error) {
    // If the database hasn't been migrated yet, retry without the new optional columns.
    if (isMissingColumnError(error)) {
      const { error: retryError } = await supabase
        .from('study_results')
        .upsert(baseRow, { onConflict: 'client_submission_id' });

      if (retryError) {
        console.error('Supabase upsert retry error:', retryError);
        return NextResponse.json({ error: retryError.message }, { status: 500 });
      }

      const appUrl = process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin || 'http://localhost:3000';
      await notifyDatabaseChange({
        table: 'study_results',
        action: 'submit_upsert_retry_without_optional_columns',
        appUrl,
        details: {
          client_submission_id,
          study_group,
        },
      });

      await sendThankYouEmail({
        participantEmail,
        lotteryOptIn,
        appUrl,
      });

      return NextResponse.json({
        ok: true,
        warning: 'Your submission was saved successfully.',
      });
    }

    console.error('Supabase upsert error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin || 'http://localhost:3000';
  await notifyDatabaseChange({
    table: 'study_results',
    action: 'submit_upsert',
    appUrl,
    details: {
      client_submission_id,
      study_group,
      participant_login_id: participantLoginId,
      participant_email: participantEmail,
      lottery_opt_in: lotteryOptIn,
    },
  });
  return NextResponse.json({ ok: true });
}
