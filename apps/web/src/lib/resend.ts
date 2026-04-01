import { Resend } from 'resend';

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

const DEFAULT_FROM = 'Agent4Socials <guyk@agent4socials.com>';
const DEFAULT_SCHEDULED_FROM = 'Agent4Socials <noreply@agent4socials.com>';

function getGeneralFrom(): string {
  return process.env.RESEND_FROM_EMAIL || process.env.RESEND_FROM || DEFAULT_FROM;
}

function getWelcomeFrom(): string {
  return process.env.RESEND_WELCOME_FROM_EMAIL || getGeneralFrom();
}

function getScheduledFrom(): string {
  return process.env.RESEND_SCHEDULED_FROM_EMAIL || DEFAULT_SCHEDULED_FROM;
}

/**
 * Sends a welcome email to a new user. No-op if RESEND_API_KEY is not set.
 */
export async function sendWelcomeEmail(to: string, name: string | null): Promise<void> {
  if (!resend) {
    console.warn('[Resend] RESEND_API_KEY not set; skipping welcome email');
    return;
  }
  const from = getWelcomeFrom();
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
 * Sends a test email to verify Resend is configured. Clearly marked as a test (different subject).
 * Returns { ok: true } on success, { ok: false, error: string } on failure.
 */
export async function sendTestEmail(to: string): Promise<{ ok: boolean; error?: string }> {
  if (!resend) {
    return { ok: false, error: 'RESEND_API_KEY not set' };
  }
  const from = getScheduledFrom();
  const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL || 'https://agent4socials.com').replace(/\/+$/, '');
  try {
    const { error } = await resend.emails.send({
      from,
      to: [to],
      subject: 'Test: Agent4Socials email is working',
      html: `
        <p>If you received this, Resend is configured correctly and scheduled post emails will work.</p>
        <p><a href="${baseUrl}/calendar" style="color:#4f46e5;font-weight:600">Open Calendar</a></p>
        <p>Real scheduled post emails will have a different subject (&quot;Your scheduled post is ready&quot;) and link directly to your post.</p>
        <p>Cheers,<br>The Agent4Socials team</p>
      `,
    });
    if (error) {
      const errMsg = typeof error === 'object' && error !== null && 'message' in error ? String((error as { message?: unknown }).message) : String(error);
      return { ok: false, error: errMsg };
    }
    return { ok: true };
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: errMsg };
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
  const from = getScheduledFrom();
  try {
    const { error } = await resend.emails.send({
      from,
      to: [to],
      subject: 'Your scheduled post is ready',
      html: `
        <p>Your scheduled post is ready. Open the link below to publish:</p>
        <p><a href="${openLink}" style="color:#4f46e5;font-weight:600">Open your post</a></p>
        <p><strong>Important:</strong> X (Twitter) and LinkedIn do not let us open a pre-filled post with images in the browser. On the page you have three options:</p>
        <ul>
          <li><strong>Publish now</strong> – One click to post to your connected accounts with captions and images. Use this for X and LinkedIn so the post goes out as-is.</li>
          <li><strong>Download media</strong> – Download each image or video, then upload them manually in X or LinkedIn and paste the caption.</li>
          <li><strong>Open in X / LinkedIn</strong> – Opens the app with the caption only (no images). You can then add images manually after downloading them from the page.</li>
        </ul>
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

/**
 * Sends a confirmation right after a post is scheduled.
 */
export async function sendScheduleConfirmationEmail(
  to: string,
  whenIso: string,
  deliveryMode: 'auto' | 'email_links',
): Promise<{ ok: boolean; error?: string }> {
  if (!resend) {
    console.warn('[Resend] RESEND_API_KEY not set; skipping schedule confirmation email');
    return { ok: false, error: 'RESEND_API_KEY not set' };
  }
  const from = getScheduledFrom();
  const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL || 'https://agent4socials.com').replace(/\/+$/, '');
  const whenLabel = new Date(whenIso).toLocaleString(undefined, {
    month: 'numeric',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
  const modeText = deliveryMode === 'auto'
    ? 'It will be published automatically at the scheduled time.'
    : 'We will email you posting links at the scheduled time.';
  try {
    const { error } = await resend.emails.send({
      from,
      to: [to],
      subject: 'Post scheduled confirmation',
      html: `
        <p>Your post was scheduled successfully for <strong>${whenLabel}</strong>.</p>
        <p>${modeText}</p>
        <p><a href="${baseUrl}/posts" style="color:#7c3aed;font-weight:600">Open Post History</a></p>
      `,
    });
    if (error) {
      const errMsg = typeof error === 'object' && error !== null && 'message' in error ? String((error as { message?: unknown }).message) : String(error);
      return { ok: false, error: errMsg };
    }
    return { ok: true };
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: errMsg };
  }
}

/**
 * Sends a failure notification when a scheduled publish attempt fails.
 */
export async function sendScheduledPublishFailureEmail(
  to: string,
  whenIso: string,
  reason: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!resend) {
    return { ok: false, error: 'RESEND_API_KEY not set' };
  }
  const from = getScheduledFrom();
  const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL || 'https://agent4socials.com').replace(/\/+$/, '');
  const whenLabel = new Date(whenIso).toLocaleString(undefined, {
    month: 'numeric',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
  try {
    const { error } = await resend.emails.send({
      from,
      to: [to],
      subject: 'Scheduled post needs attention',
      html: `
        <p>We could not auto-publish your scheduled post at <strong>${whenLabel}</strong>.</p>
        <p><strong>Status:</strong> Failed</p>
        <p><strong>Reason:</strong> ${reason || 'Unknown error'}</p>
        <p>
          <a href="${baseUrl}/posts" style="color:#7c3aed;font-weight:600">Open Post History</a><br/>
          <a href="${baseUrl}/help/support" style="color:#7c3aed;font-weight:600">Contact support</a>
        </p>
      `,
    });
    if (error) {
      const errMsg = typeof error === 'object' && error !== null && 'message' in error ? String((error as { message?: unknown }).message) : String(error);
      return { ok: false, error: errMsg };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

const SUPPORT_EMAIL_TO = process.env.SUPPORT_EMAIL || 'support@agent4socials.com';

/**
 * Sends a support ticket from a user to the support inbox and optionally sends an auto-reply.
 * Returns { ok: true } on success, { ok: false, error: string } on failure.
 */
export async function sendSupportTicketEmail(
  senderEmail: string,
  subject: string,
  message: string,
  senderName?: string | null
): Promise<{ ok: boolean; error?: string }> {
  if (!resend) {
    return { ok: false, error: 'Email service is not configured' };
  }
  const from = getGeneralFrom();
  const displayName = senderName || senderEmail;
  const safeSubject = subject.slice(0, 200).trim() || 'Support request | Agent4Socials';
  const safeMessage = message.slice(0, 10000).replace(/\n/g, '<br>');
  try {
    const { error } = await resend.emails.send({
      from,
      to: [SUPPORT_EMAIL_TO],
      replyTo: senderEmail,
      subject: `[Support] ${safeSubject}`,
      html: `
        <p><strong>From:</strong> ${displayName} &lt;${senderEmail}&gt;</p>
        <p><strong>Subject:</strong> ${safeSubject}</p>
        <hr style="border:0;border-top:1px solid #eee;margin:1em 0"/>
        <div>${safeMessage}</div>
        <hr style="border:0;border-top:1px solid #eee;margin:1em 0"/>
        <p style="color:#666;font-size:12px">Sent via Agent4Socials Help → Support ticket form.</p>
      `,
    });
    if (error) {
      const errMsg = typeof error === 'object' && error !== null && 'message' in error ? String((error as { message?: unknown }).message) : String(error);
      return { ok: false, error: errMsg };
    }
    return { ok: true };
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: errMsg };
  }
}
