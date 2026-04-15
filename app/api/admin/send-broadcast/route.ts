import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';
import { NextRequest, NextResponse } from 'next/server';

type BroadcastBody = {
  subject?: string;
  html?: string;
  target?: 'all' | 'individual';
  recipient_email?: string;
};

type ParticipantRow = {
  email: string | null;
  full_name: string | null;
  access_code: string | null;
  login_id: string | null;
  availability_label: string | null;
  availability_slots: string[] | null;
};

function getExpectedAdminCode(): string {
  return process.env.ADMIN_ACCESS_CODE || 'Triangle123!.';
}

function isAuthorized(request: NextRequest): boolean {
  const code = request.headers.get('x-admin-code') || '';
  return code === getExpectedAdminCode();
}

function renderTemplate(template: string, participant: ParticipantRow, appUrl: string): string {
  const fullName = (participant.full_name ?? '').trim();
  const firstName = fullName.split(/\s+/).filter(Boolean)[0] ?? '';
  const availabilitySlots = Array.isArray(participant.availability_slots)
    ? participant.availability_slots.join(', ')
    : '';

  const variables: Record<string, string> = {
    full_name: fullName || 'Participant',
    first_name: firstName || 'Participant',
    email: (participant.email ?? '').trim(),
    access_code: (participant.access_code ?? '').trim(),
    login_id: (participant.login_id ?? '').trim(),
    availability_label: (participant.availability_label ?? '').trim() || 'async',
    availability_slots: availabilitySlots || 'None',
    availability_url: `${appUrl.replace(/\/$/, '')}/availability`,
    app_url: appUrl,
  };

  let rendered = template;
  for (const [key, value] of Object.entries(variables)) {
    const pattern = new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, 'gi');
    rendered = rendered.replace(pattern, value);
  }
  return rendered;
}

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    return NextResponse.json({ error: 'Supabase is not configured.' }, { status: 503 });
  }

  let body: BroadcastBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const subject = (body.subject ?? '').trim();
  const html = (body.html ?? '').trim();
  if (!subject || !html) {
    return NextResponse.json({ error: 'Both subject and html body are required.' }, { status: 400 });
  }
  const target = body.target === 'individual' ? 'individual' : 'all';
  const recipientEmail =
    typeof body.recipient_email === 'string' ? body.recipient_email.trim().toLowerCase() : '';
  if (target === 'individual' && !recipientEmail) {
    return NextResponse.json(
      { error: 'recipient_email is required when target is individual.' },
      { status: 400 }
    );
  }

  const resendApiKey = process.env.RESEND_API_KEY;
  const resendFrom = process.env.RESEND_FROM_EMAIL || 'AP Research <onboarding@resend.dev>';
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin || 'http://localhost:3000';
  if (!resendApiKey) {
    return NextResponse.json({ error: 'RESEND_API_KEY is not configured.' }, { status: 503 });
  }

  const supabase = createClient(url, serviceRoleKey);
  const { data: participants, error: participantErr } = await supabase
    .from('study_participants')
    .select('email,full_name,access_code,login_id,availability_label,availability_slots')
    .not('email', 'is', null);

  if (participantErr) {
    return NextResponse.json({ error: participantErr.message }, { status: 500 });
  }

  const uniqueParticipants = new Map<string, ParticipantRow>();
  for (const row of (participants ?? []) as ParticipantRow[]) {
    const email = typeof row.email === 'string' ? row.email.trim().toLowerCase() : '';
    if (!email) continue;
    if (!uniqueParticipants.has(email)) {
      uniqueParticipants.set(email, {
        ...row,
        email,
      });
    }
  }
  const allRecipients = Array.from(uniqueParticipants.values());
  const recipients =
    target === 'individual'
      ? allRecipients.filter((participant) => participant.email === recipientEmail)
      : allRecipients;

  if (!recipients.length) {
    return NextResponse.json(
      {
        error:
          target === 'individual'
            ? 'Selected participant email was not found.'
            : 'No participant emails found.',
      },
      { status: 400 }
    );
  }

  try {
    const resend = new Resend(resendApiKey);
    let sentCount = 0;
    const failures: Array<{ email: string; error: string }> = [];

    for (const participant of recipients) {
      const to = participant.email as string;
      const personalizedSubject = renderTemplate(subject, participant, appUrl);
      const personalizedHtml = renderTemplate(html, participant, appUrl);

      try {
        const sendResult = await resend.emails.send({
          from: resendFrom,
          to: [to],
          subject: personalizedSubject,
          html: personalizedHtml,
        });
        if (sendResult?.error) {
          failures.push({
            email: to,
            error: sendResult.error.message || 'Resend returned an unknown error.',
          });
          continue;
        }
        sentCount += 1;
      } catch (error) {
        failures.push({
          email: to,
          error: error instanceof Error ? error.message : 'Unknown send error.',
        });
      }
    }

    return NextResponse.json({
      ok: true,
      sent_count: sentCount,
      total_recipients: recipients.length,
      failure_count: failures.length,
      failures: failures.slice(0, 20),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Broadcast send failed.',
      },
      { status: 500 }
    );
  }
}
