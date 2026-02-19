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
    } else {
      console.log('[Resend] Welcome email sent to', to);
    }
  } catch (e) {
    console.error('[Resend] Welcome email error:', e);
  }
}

/**
 * Sends "your post is ready" email with a link to open and post manually per platform.
 * Returns { ok: true } on success, { ok: false, error: string } on failure.
 */
export async function sendScheduledPostLinksEmail(to: string, openLink: string): Promise<{ ok: boolean; error?: string }> {
  if (!resend) {
    console.warn('[Resend] RESEND_API_KEY not set; skipping scheduled post links email');
    return { ok: false, error: 'RESEND_API_KEY not set' };
  }
  const from = process.env.RESEND_FROM_EMAIL || process.env.RESEND_FROM || DEFAULT_FROM;
  try {
    const { error } = await resend.emails.send({
      from,
      to: [to],
      subject: 'Your scheduled post is ready – post manually',
      html: `
        <p>Your scheduled post is ready. Open the link below to see your content and open each platform to edit, add sound, and publish manually.</p>
        <p><a href="${openLink}" style="color:#4f46e5;font-weight:600">Open post and get platform links</a></p>
        <p>This link is valid for 7 days. If you didn't schedule a post, you can ignore this email.</p>
        <p>Cheers,<br>The Agent4Socials team</p>
      `,
    });
    if (error) {
      const errMsg = typeof error === 'object' && error !== null && 'message' in error ? String((error as { message?: unknown }).message) : String(error);
      console.error('[Resend] Scheduled post links email failed:', error);
      return { ok: false, error: errMsg };
    }
    return { ok: true };
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : String(e);
    console.error('[Resend] Scheduled post links email error:', e);
    return { ok: false, error: errMsg };
  }
}
