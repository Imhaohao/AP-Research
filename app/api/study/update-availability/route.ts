import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { notifyDatabaseChange } from '@/lib/dbChangeAlerts';

type AvailabilityBody = {
  access_code?: string;
  availability?: {
    in_person_interest?: 'yes' | 'no' | '';
    in_person_dates?: string[];
    after_school_interest?: 'yes' | 'no' | '';
    after_school_dates?: string[];
  };
};

type AvailabilityLabel =
  | 'prime'
  | 'study_hall'
  | 'prime_and_study_hall'
  | 'after_school'
  | 'async';

export async function POST(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    return NextResponse.json({ error: 'Supabase is not configured.' }, { status: 503 });
  }

  let body: AvailabilityBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const accessCode = (body.access_code ?? '').trim();
  if (!accessCode) {
    return NextResponse.json({ error: 'Access code is required.' }, { status: 400 });
  }

  const availability = body.availability ?? {};
  const inPersonInterest = availability.in_person_interest;
  const inPersonDates = Array.isArray(availability.in_person_dates)
    ? availability.in_person_dates.filter((d) => typeof d === 'string' && d.trim())
    : [];
  const afterSchoolInterest = availability.after_school_interest;
  const afterSchoolDates = Array.isArray(availability.after_school_dates)
    ? availability.after_school_dates.filter((d) => typeof d === 'string' && d.trim())
    : [];

  let availabilityLabel: AvailabilityLabel;
  let availabilitySlots: string[] = [];

  if (inPersonInterest === 'yes') {
    if (!inPersonDates.length) {
      return NextResponse.json(
        { error: 'Select at least one PRIME or Study Hall slot in the next two weeks.' },
        { status: 400 }
      );
    }
    const hasPrime = inPersonDates.some((d) => new Date(d).getDay() === 3);
    const hasStudyHall = inPersonDates.some((d) => new Date(d).getDay() === 5);
    availabilityLabel = hasPrime && hasStudyHall
      ? 'prime_and_study_hall'
      : hasPrime
        ? 'prime'
        : 'study_hall';
    availabilitySlots = inPersonDates;
  } else if (inPersonInterest === 'no') {
    if (afterSchoolInterest === 'yes') {
      if (!afterSchoolDates.length) {
        return NextResponse.json(
          { error: 'Please select at least one after-school date in the next two weeks.' },
          { status: 400 }
        );
      }
      availabilityLabel = 'after_school';
      availabilitySlots = afterSchoolDates;
    } else if (afterSchoolInterest === 'no') {
      availabilityLabel = 'async';
      availabilitySlots = [];
    } else {
      return NextResponse.json(
        { error: 'Please answer whether you can meet after school for under an hour.' },
        { status: 400 }
      );
    }
  } else {
    return NextResponse.json(
      { error: 'Please answer availability for PRIME or Study Hall first.' },
      { status: 400 }
    );
  }

  const supabase = createClient(url, serviceRoleKey);
  const { data: existing, error: lookupErr } = await supabase
    .from('study_participants')
    .select('login_id')
    .ilike('access_code', accessCode)
    .maybeSingle();

  if (lookupErr) {
    return NextResponse.json({ error: lookupErr.message }, { status: 500 });
  }
  if (!existing) {
    return NextResponse.json({ error: 'Invalid access code.' }, { status: 404 });
  }

  const { error: updateErr } = await supabase
    .from('study_participants')
    .update({
      available_prime: availabilityLabel === 'prime' || availabilityLabel === 'prime_and_study_hall',
      availability_label: availabilityLabel,
      availability_slots: availabilitySlots,
      updated_at: new Date().toISOString(),
    })
    .ilike('access_code', accessCode);

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin || 'http://localhost:3000';
  await notifyDatabaseChange({
    table: 'study_participants',
    action: 'availability_update',
    appUrl,
    details: {
      login_id: existing.login_id,
      access_code: accessCode,
      availability_label: availabilityLabel,
      availability_slots: availabilitySlots,
    },
  });

  return NextResponse.json({
    ok: true,
    availability_label: availabilityLabel,
    availability_slots: availabilitySlots,
  });
}
