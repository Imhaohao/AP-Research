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
  const { data, error } = await supabase
    .from('study_participants')
    .select('login_id,access_code,full_name,email,grade,availability_label,availability_slots,created_at')
    .order('created_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ participants: data ?? [] });
}
