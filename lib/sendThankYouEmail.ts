import { Resend } from 'resend';

function buildThankYouEmailHtml(params: {
  participantEmail: string;
  lotteryOptIn: boolean | null;
  appUrl: string;
}) {
  const { participantEmail, lotteryOptIn, appUrl } = params;
  const raffleText =
    lotteryOptIn === true
      ? 'You are entered into the ChatGPT raffle.'
      : lotteryOptIn === false
        ? 'You chose not to enter the ChatGPT raffle.'
        : 'Your raffle entry status was not recorded.';

  return `
    <div style="font-family: Inter, Arial, sans-serif; line-height: 1.6; color: #1f2937;">
      <h2 style="margin: 0 0 12px;">Thank you for participating</h2>
      <p>Hi ${participantEmail},</p>
      <p>
        Thank you for spending your time on this AP Research study. Your response has been successfully submitted.
      </p>
      <p>
        <strong>Raffle status:</strong> ${raffleText}
      </p>
      <p>
        You can return to the study page here:<br />
        <a href="${appUrl}">${appUrl}</a>
      </p>
      <p>
        We appreciate your participation and support for this research.
      </p>
      <p>
        Best,<br />
        Jerry Yan<br />
        AP Research
      </p>
    </div>
  `;
}

export async function sendThankYouEmail(params: {
  participantEmail: string | null;
  lotteryOptIn: boolean | null;
  appUrl: string;
}) {
  const { participantEmail, lotteryOptIn, appUrl } = params;
  if (!participantEmail) return;

  const resendApiKey = process.env.RESEND_API_KEY;
  const resendFrom = process.env.RESEND_FROM_EMAIL || 'AP Research <onboarding@resend.dev>';
  if (!resendApiKey) return;

  try {
    const resend = new Resend(resendApiKey);
    await resend.emails.send({
      from: resendFrom,
      to: [participantEmail],
      subject: 'Thank you for participating in AP Research',
      html: buildThankYouEmailHtml({
        participantEmail,
        lotteryOptIn,
        appUrl,
      }),
    });
  } catch (emailError) {
    console.error('Failed to send post-submission thank-you email:', emailError);
  }
}
