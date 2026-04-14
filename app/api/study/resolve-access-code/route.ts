import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

type ResolveBody = {
  access_code?: string;
};

export async function POST(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    return NextResponse.json(
      { error: 'Supabase is not configured for secure access-code lookup.' },
      { status: 503 }
    );
  }

  let body: ResolveBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const accessCode = (body.access_code ?? '').trim().toUpperCase();
  if (!accessCode) {
    return NextResponse.json({ error: 'Access code is required.' }, { status: 400 });
  }

  const supabase = createClient(url, serviceRoleKey);
  const { data, error } = await supabase
    .from('study_participants')
    .select('login_id,email,full_name')
    .eq('access_code', accessCode)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({ error: 'Invalid access code.' }, { status: 404 });
  }

  return NextResponse.json({
    login_id: data.login_id,
    email: data.email,
    full_name: data.full_name,
  });
}
