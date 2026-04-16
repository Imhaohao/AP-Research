import { Resend } from 'resend';

type DatabaseAlertInput = {
  table: string;
  action: string;
  details?: Record<string, unknown>;
  appUrl?: string;
};

function isAlertEnabled(): boolean {
  const raw = (process.env.DB_CHANGE_ALERTS_ENABLED ?? 'true').toLowerCase().trim();
  return !['false', '0', 'no', 'off'].includes(raw);
}

function escapeHtml(value: unknown): string {
  const str = String(value ?? '');
  return str
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export async function notifyDatabaseChange(input: DatabaseAlertInput): Promise<void> {
  if (!isAlertEnabled()) return;

  const resendApiKey = process.env.RESEND_API_KEY;
  if (!resendApiKey) return;

  const toEmail = process.env.ADMIN_ALERT_EMAIL || 'zy53492@pausd.us';
  const fromEmail = process.env.RESEND_FROM_EMAIL || 'AP Research <onboarding@resend.dev>';
  const appUrl = input.appUrl || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const when = new Date().toISOString();
  const detailsJson = JSON.stringify(input.details ?? {}, null, 2);

  const subject = `[AP Research DB] ${input.table}: ${input.action}`;
  const html = `
    <div style="font-family: Inter, Arial, sans-serif; line-height: 1.55; color: #111827;">
      <h2 style="margin: 0 0 8px;">Database change detected</h2>
      <p style="margin: 0 0 10px;"><strong>Table:</strong> ${escapeHtml(input.table)}</p>
      <p style="margin: 0 0 10px;"><strong>Action:</strong> ${escapeHtml(input.action)}</p>
      <p style="margin: 0 0 10px;"><strong>Time (UTC):</strong> ${escapeHtml(when)}</p>
      <p style="margin: 0 0 10px;"><strong>App:</strong> <a href="${escapeHtml(appUrl)}">${escapeHtml(appUrl)}</a></p>
      <p style="margin: 0 0 6px;"><strong>Details:</strong></p>
      <pre style="white-space: pre-wrap; background: #f9fafb; border: 1px solid #e5e7eb; padding: 10px; border-radius: 8px;">${escapeHtml(detailsJson)}</pre>
    </div>
  `;

  try {
    const resend = new Resend(resendApiKey);
    await resend.emails.send({
      from: fromEmail,
      to: [toEmail],
      subject,
      html,
    });
  } catch (error) {
    console.error('Failed to send DB change alert email:', error);
  }
}
