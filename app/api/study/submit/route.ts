import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

type SubmitBody = {
  client_submission_id: string;
  study_group: 'control' | 'treatment';
  data: Record<string, unknown>;
};

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

  const { client_submission_id, study_group, data } = body;
  if (
    typeof client_submission_id !== 'string' ||
    !client_submission_id ||
    (study_group !== 'control' && study_group !== 'treatment') ||
    data === null ||
    typeof data !== 'object'
  ) {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  const supabase = createClient(url, key);
  const now = new Date().toISOString();

  const row = {
    client_submission_id,
    study_group,
    data,
    updated_at: now,
  };

  const { error } = await supabase
    .from('study_results')
    .upsert(row, { onConflict: 'client_submission_id' });

  if (error) {
    console.error('Supabase upsert error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
