import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';
import { NextRequest, NextResponse } from 'next/server';

const GRADE_VALUES = ['Freshman', 'Sophomore', 'Junior', 'Senior'] as const;

type GradeValue = (typeof GRADE_VALUES)[number];

type SignupBody = {
  agree?: boolean;
  name?: string;
  email?: string;
  availability?: {
    in_person_interest?: 'yes' | 'no' | '';
    in_person_dates?: string[];
    after_school_interest?: 'yes' | 'no' | '';
    after_school_dates?: string[];
  };
  grade?: GradeValue;
  likert?: {
    ai_use_frequency?: number;
    prompt_confidence?: number;
    clear_prompt_understanding?: number;
    ask_final_answers?: number;
    step_by_step_use?: number;
    accuracy_bias_eval?: number;
    responsible_learning_belief?: number;
  };
  free_response?: {
    schoolwork_ai_use?: string;
    good_prompt_definition?: string;
    ai_school_concerns?: string;
  };
};

type AvailabilityLabel =
  | 'prime'
  | 'study_hall'
  | 'prime_and_study_hall'
  | 'after_school'
  | 'async';

function isLikert(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) >= 1 && Number(value) <= 5;
}

function normalizeText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const v = value.trim();
  return v ? v : null;
}

function randomCode(length: number): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let result = '';
  for (let i = 0; i < length; i += 1) {
    result += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return result;
}

async function createUniqueValue(
  supabase: any,
  column: 'login_id' | 'access_code',
  makeCandidate: () => string
): Promise<string> {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const candidate = makeCandidate();
    const { data } = await supabase
      .from('study_participants')
      .select(column)
      .eq(column, candidate)
      .maybeSingle();
    if (!data) return candidate;
  }
  throw new Error(`Could not generate a unique ${column}.`);
}

function buildEmailHtml(params: {
  name: string;
  loginId: string;
  accessCode: string;
  grade: GradeValue;
  availabilityLabel: AvailabilityLabel;
  availabilitySlots: string[];
  likert: Record<string, number>;
  freeResponse: Record<string, string | null>;
  appUrl: string;
}) {
  const {
    name,
    loginId,
    accessCode,
    grade,
    availabilityLabel,
    availabilitySlots,
    likert,
    freeResponse,
    appUrl,
  } = params;
  return `
    <div style="font-family: Inter, Arial, sans-serif; line-height: 1.5; color: #1f2937;">
      <h2 style="margin-bottom: 8px;">AP Research Experiment Signup Confirmation</h2>
      <p>Hi ${name},</p>
      <p>Thanks for signing up. Your access code is:</p>
      <p style="font-size: 20px; font-weight: 700; letter-spacing: 1px; margin: 10px 0 20px;">
        ${accessCode}
      </p>
      <p>Your participant login ID is: <strong>${loginId}</strong></p>
      <p>Use this link to return to the study start page:</p>
      <p><a href="${appUrl}">${appUrl}</a></p>

      <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;" />
      <h3 style="margin-bottom: 8px;">Your submitted details</h3>
      <ul>
        <li><strong>Grade:</strong> ${grade}</li>
        <li><strong>Availability label:</strong> ${availabilityLabel}</li>
        <li><strong>Selected slots:</strong> ${availabilitySlots.length ? availabilitySlots.join(', ') : 'None (async)'}</li>
      </ul>
      <p><strong>Likert responses:</strong></p>
      <ul>
        <li>AI use frequency: ${likert.ai_use_frequency}</li>
        <li>Prompt confidence: ${likert.prompt_confidence}</li>
        <li>Clear prompt understanding: ${likert.clear_prompt_understanding}</li>
        <li>Ask final answers: ${likert.ask_final_answers}</li>
        <li>Step-by-step AI use: ${likert.step_by_step_use}</li>
        <li>Evaluate accuracy/bias: ${likert.accuracy_bias_eval}</li>
        <li>AI helps responsible learning: ${likert.responsible_learning_belief}</li>
      </ul>
      <p><strong>Free responses:</strong></p>
      <ul>
        <li>Schoolwork AI use: ${freeResponse.schoolwork_ai_use ?? 'N/A'}</li>
        <li>Good prompt definition: ${freeResponse.good_prompt_definition ?? 'N/A'}</li>
        <li>Concerns about AI in school: ${freeResponse.ai_school_concerns ?? 'N/A'}</li>
      </ul>
    </div>
  `;
}

export async function POST(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    return NextResponse.json(
      { error: 'Supabase is not configured (NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY).' },
      { status: 503 }
    );
  }

  let body: SignupBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const agree = body.agree === true;
  const name = normalizeText(body.name);
  const emailRaw = normalizeText(body.email);
  const email = emailRaw?.toLowerCase() ?? null;
  const availability = body.availability ?? {};
  const grade = body.grade;
  const likert = body.likert;
  const freeResponse = body.free_response ?? {};

  if (!agree) {
    return NextResponse.json({ error: 'Consent is required to sign up.' }, { status: 400 });
  }
  if (!name) {
    return NextResponse.json({ error: 'Name is required.' }, { status: 400 });
  }
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: 'A valid email is required.' }, { status: 400 });
  }
  if (!grade || !GRADE_VALUES.includes(grade)) {
    return NextResponse.json({ error: 'Grade is required.' }, { status: 400 });
  }
  if (
    !likert ||
    !isLikert(likert.ai_use_frequency) ||
    !isLikert(likert.prompt_confidence) ||
    !isLikert(likert.clear_prompt_understanding) ||
    !isLikert(likert.ask_final_answers) ||
    !isLikert(likert.step_by_step_use) ||
    !isLikert(likert.accuracy_bias_eval) ||
    !isLikert(likert.responsible_learning_belief)
  ) {
    return NextResponse.json({ error: 'All Likert answers must be selected (1-5).' }, { status: 400 });
  }

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
    if (inPersonDates.length === 0) {
      return NextResponse.json(
        { error: 'Select at least one PRIME or Study Hall slot in the next two weeks.' },
        { status: 400 }
      );
    }
    const hasPrime = inPersonDates.some((d) => {
      const day = new Date(d).getDay();
      return day === 3;
    });
    const hasStudyHall = inPersonDates.some((d) => {
      const day = new Date(d).getDay();
      return day === 5;
    });
    availabilityLabel = hasPrime && hasStudyHall
      ? 'prime_and_study_hall'
      : hasPrime
        ? 'prime'
        : 'study_hall';
    availabilitySlots = inPersonDates;
  } else if (inPersonInterest === 'no') {
    if (afterSchoolInterest === 'yes') {
      if (afterSchoolDates.length === 0) {
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
      {
        error:
          'Please answer availability for PRIME or Study Hall first.',
      },
      { status: 400 }
    );
  }

  const supabase = createClient(url, serviceRoleKey);
  const { data: existing, error: existingError } = await supabase
    .from('study_participants')
    .select('login_id,access_code')
    .eq('email', email)
    .maybeSingle();

  if (existingError) {
    return NextResponse.json({ error: existingError.message }, { status: 500 });
  }

  const loginId =
    existing?.login_id ??
    (await createUniqueValue(supabase, 'login_id', () => `APR${randomCode(6)}`));
  const accessCode =
    existing?.access_code ??
    (await createUniqueValue(supabase, 'access_code', () => randomCode(8)));

  const freePayload = {
    schoolwork_ai_use: normalizeText(freeResponse.schoolwork_ai_use),
    good_prompt_definition: normalizeText(freeResponse.good_prompt_definition),
    ai_school_concerns: normalizeText(freeResponse.ai_school_concerns),
  };

  const { error: upsertError } = await supabase.from('study_participants').upsert(
    {
      login_id: loginId,
      access_code: accessCode,
      email,
      full_name: name,
      available_prime: availabilityLabel === 'prime' || availabilityLabel === 'prime_and_study_hall',
      availability_label: availabilityLabel,
      availability_slots: availabilitySlots,
      grade,
      likert,
      free_response: freePayload,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'email' }
  );

  if (upsertError) {
    return NextResponse.json({ error: upsertError.message }, { status: 500 });
  }

  const resendApiKey = process.env.RESEND_API_KEY;
  const resendFrom = process.env.RESEND_FROM_EMAIL || 'AP Research <onboarding@resend.dev>';
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin || 'http://localhost:3000';

  if (!resendApiKey) {
    return NextResponse.json(
      {
        ok: true,
        warning: 'Signup saved, but RESEND_API_KEY is not configured. Email was not sent.',
        login_id: loginId,
        access_code: accessCode,
      },
      { status: 200 }
    );
  }

  try {
    const resend = new Resend(resendApiKey);
    await resend.emails.send({
      from: resendFrom,
      to: [email],
      subject: 'Your AP Research experiment access code',
      html: buildEmailHtml({
        name,
        loginId,
        accessCode,
        grade,
        availabilityLabel,
        availabilitySlots,
        likert: {
          ai_use_frequency: likert.ai_use_frequency,
          prompt_confidence: likert.prompt_confidence,
          clear_prompt_understanding: likert.clear_prompt_understanding,
          ask_final_answers: likert.ask_final_answers,
          step_by_step_use: likert.step_by_step_use,
          accuracy_bias_eval: likert.accuracy_bias_eval,
          responsible_learning_belief: likert.responsible_learning_belief,
        },
        freeResponse: freePayload,
        appUrl,
      }),
    });
  } catch (emailError) {
    return NextResponse.json(
      {
        ok: true,
        warning:
          emailError instanceof Error
            ? `Signup saved, but email failed: ${emailError.message}`
            : 'Signup saved, but email failed.',
        login_id: loginId,
        access_code: accessCode,
      },
      { status: 200 }
    );
  }

  return NextResponse.json({
    ok: true,
    message: 'Signup complete. Access code sent to your email.',
    login_id: loginId,
    access_code: accessCode,
  });
}
