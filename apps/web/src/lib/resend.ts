import { Resend } from 'resend';

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

const DEFAULT_FROM = 'Agent4Socials <guyk@agent4socials.com>';

/**
 * Sends a welcome email to a new user. No-op if RESEND_API_KEY is not set.
 */
export async function sendWelcomeEmail(to: string, name: string | null): Promise<void> {
  if (!resend) {
    console.warn('[Resend] RESEND_API_KEY not set; skipping welcome email');
    return;
  }
  const from = process.env.RESEND_FROM_EMAIL || process.env.RESEND_FROM || DEFAULT_FROM;
  const displayName = name || 'there';
  try {
    const { error } = await resend.emails.send({
      from,
      to: [to],
      subject: 'Welcome to Agent4Socials',
      html: `
        <h1>Welcome to Agent4Socials</h1>
        <p>Hi ${displayName},</p>
        <p>Thanks for signing up. You're all set to start scheduling and managing your social posts.</p>
        <p>If you have any questions, just reply to this email.</p>
        <p>Cheers,<br>The Agent4Socials team</p>
      `,
    });
    if (error) {
      console.error('[Resend] Welcome email failed:', error);
    }
  } catch (e) {
    console.error('[Resend] Welcome email error:', e);
  }
}
