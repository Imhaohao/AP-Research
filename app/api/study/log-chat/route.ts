import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });
  }

  let body: {
    client_submission_id?: string;
    study_group?: string;
    turn_index?: number;
    session_profile?: Record<string, unknown>;
    user_message?: string;
    full_prompt?: string;
    assistant_response?: string;
    model?: string | null;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const ALLOWED = new Set([
    'control',
    'treatment',
    'unrestricted_ai',
    'guided_ai',
    'prompt_bank_ai',
  ]);

  const {
    client_submission_id,
    study_group,
    turn_index,
    session_profile,
    user_message,
    full_prompt,
    assistant_response,
    model,
  } = body;

  if (
    typeof client_submission_id !== 'string' ||
    !client_submission_id ||
    typeof study_group !== 'string' ||
    !ALLOWED.has(study_group) ||
    typeof turn_index !== 'number' ||
    !Number.isInteger(turn_index) ||
    turn_index < 1 ||
    session_profile === null ||
    typeof session_profile !== 'object' ||
    typeof user_message !== 'string' ||
    typeof full_prompt !== 'string' ||
    typeof assistant_response !== 'string'
  ) {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  const supabase = createClient(url, key);
  const { error } = await supabase.from('study_chat_turns').insert({
    client_submission_id,
    study_group,
    turn_index,
    session_profile,
    user_message,
    full_prompt,
    assistant_response,
    model: model ?? null,
  });

  if (error) {
    console.error('Supabase study_chat_turns insert:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
