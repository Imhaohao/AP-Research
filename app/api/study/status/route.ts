import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { fetchStudyStatus } from '@/lib/studyStatus';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    return NextResponse.json(
      {
        is_open: true,
        source: 'default',
        warning: 'Supabase is not configured.',
      },
      { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } }
    );
  }

  const supabase = createClient(url, serviceRoleKey);
  const status = await fetchStudyStatus(supabase);

  return NextResponse.json(
    {
      is_open: status.isOpen,
      source: status.source,
      warning: status.warning ?? null,
    },
    { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } }
  );
}
