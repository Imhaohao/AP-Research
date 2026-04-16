import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { fetchStudyStatus, upsertStudyStatus } from '@/lib/studyStatus';
import { notifyDatabaseChange } from '@/lib/dbChangeAlerts';

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
  const status = await fetchStudyStatus(supabase);
  return NextResponse.json({
    is_open: status.isOpen,
    updated_at: status.updatedAt,
    source: status.source,
    warning: status.warning ?? null,
  });
}

type UpdateBody = {
  is_open?: boolean;
};

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    return NextResponse.json({ error: 'Supabase is not configured.' }, { status: 503 });
  }

  let body: UpdateBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  if (typeof body.is_open !== 'boolean') {
    return NextResponse.json({ error: 'is_open boolean is required.' }, { status: 400 });
  }

  const supabase = createClient(url, serviceRoleKey);
  const result = await upsertStudyStatus(supabase, body.is_open);
  if (result.error) {
    const schemaHint = result.error.includes("Could not find the table 'public.study_config'")
      ? ' Please run supabase/add_study_status_control.sql in Supabase SQL Editor first.'
      : '';
    return NextResponse.json(
      {
        error: `Failed to update study status. ${result.error}${schemaHint}`,
      },
      { status: 500 }
    );
  }

  await notifyDatabaseChange({
    table: 'study_config',
    action: 'admin_study_status_update',
    appUrl: process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin || 'http://localhost:3000',
    details: {
      is_open: result.isOpen,
      updated_at: result.updatedAt,
    },
  });

  return NextResponse.json({
    ok: true,
    is_open: result.isOpen,
    updated_at: result.updatedAt,
  });
}
