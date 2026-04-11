import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { PostStatus } from '@prisma/client';
import { randomBytes } from 'crypto';
import { sendScheduledPostLinksEmail, sendScheduledPublishFailureEmail } from '@/lib/resend';

export const maxDuration = 25;

const baseUrl = () =>
  (process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL || 'https://agent4socials.com').replace(/\/+$/, '');

/**
 * GET/POST /api/cron/process-scheduled
 * Call with header X-Cron-Secret: CRON_SECRET (or Authorization: Bearer CRON_SECRET).
 * Finds posts due now: scheduleDelivery=email_links -> send email with open link; scheduleDelivery=auto -> publish.
 * Also runs comment automation (keyword replies on published posts) so one cron job can do both.
 * Work runs inline — no after() — to release the lambda as soon as processing finishes.
 */
async function handle(request: NextRequest) {
  try {
    return await processScheduledInline(request);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[Cron] process-scheduled error:', err);
    return NextResponse.json(
      { message: 'Cron failed', error: message, processed: 0, results: [] },
      { status: 500 }
    );
  }
}

export const GET = handle;
export const POST = handle;

function authorizeCron(request: NextRequest): NextResponse | null {
  const cronSecret =
    request.headers.get('X-Cron-Secret') ||
    request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ||
    request.nextUrl.searchParams.get('secret');
  if (!process.env.CRON_SECRET || cronSecret !== process.env.CRON_SECRET) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }
  return null;
}

async function processScheduledInline(request: NextRequest) {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ message: 'DATABASE_URL required' }, { status: 503 });
  }
  const denied = authorizeCron(request);
  if (denied) return denied;

  const result = await executeProcessScheduled();
  return NextResponse.json({ ok: true, ...result });
}

async function executeProcessScheduled() {
  const now = new Date();
  let due;
  try {
    due = await prisma.post.findMany({
      where: {
        status: PostStatus.SCHEDULED,
        scheduledAt: { lte: now },
      },
      take: 10,
      include: {
        user: { select: { id: true, email: true } },
        targets: true,
      },
    });
  } catch (dbErr) {
    console.error('[Cron] Database error in process-scheduled:', dbErr);
    return { processed: 0, results: [], error: 'Database error' };
  }

  if (due.length > 0) {
    console.log('[Cron] process-scheduled: found', due.length, 'due post(s)');
  }

  const results: { postId: string; action: string; ok: boolean; error?: string }[] = [];

  for (const post of due) {
    const scheduleDelivery = (post as { scheduleDelivery?: string | null }).scheduleDelivery;
    const scheduleEmailSentAt = (post as { scheduleEmailSentAt?: Date | null }).scheduleEmailSentAt;

    if (scheduleDelivery === 'email_links') {
      if (scheduleEmailSentAt) {
        results.push({ postId: post.id, action: 'email_links', ok: true });
        continue;
      }
      const token = randomBytes(24).toString('base64url');
      const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      await prisma.post.update({
        where: { id: post.id },
        data: {
          emailOpenToken: token,
          emailOpenTokenExpiresAt: expiresAt,
        },
      });
      const openLink = `${baseUrl()}/post/${post.id}/open?t=${encodeURIComponent(token)}`;
      const userEmail = (post as typeof post & { user?: { email?: string | null } }).user?.email ?? null;
      if (!userEmail) {
        results.push({ postId: post.id, action: 'email_links', ok: false, error: 'User has no email' });
        continue;
      }
      const sendResult = await sendScheduledPostLinksEmail(userEmail, openLink);
      if (sendResult.ok) {
        await prisma.post.update({
          where: { id: post.id },
          data: { scheduleEmailSentAt: now },
        });
      }
      if (!sendResult.ok && post.scheduledAt) {
        await sendScheduledPublishFailureEmail(userEmail, post.scheduledAt.toISOString(), sendResult.error || 'Failed to send scheduled email links');
      }
      results.push({ postId: post.id, action: 'email_links', ok: sendResult.ok, error: sendResult.error });
      continue;
    }

    // auto (or legacy null): trigger publish
    try {
      const res = await fetch(`${baseUrl()}/api/posts/${post.id}/publish`, {
        method: 'POST',
        headers: { 'X-Cron-Secret': process.env.CRON_SECRET ?? '' },
      });
      const ok = res.ok;
      const body = await res.json().catch(() => ({}));
      if (!ok && post.user?.email && post.scheduledAt) {
        await sendScheduledPublishFailureEmail(
          post.user.email,
          post.scheduledAt.toISOString(),
          (body as { message?: string; error?: string }).message ||
            (body as { error?: string }).error ||
            res.statusText ||
            'Publish failed',
        );
      }
      results.push({
        postId: post.id,
        action: 'publish',
        ok,
        error: ok ? undefined : (body as { message?: string; error?: string }).message || (body as { error?: string }).error || res.statusText,
      });
    } catch (err) {
      if (post.user?.email && post.scheduledAt) {
        await sendScheduledPublishFailureEmail(post.user.email, post.scheduledAt.toISOString(), (err as Error).message || 'Publish failed');
      }
      results.push({
        postId: post.id,
        action: 'publish',
        ok: false,
        error: (err as Error).message,
      });
    }
  }

  let commentAutomationResult: { ok?: boolean; results?: unknown } = {};
  try {
    const commentRes = await fetch(`${baseUrl()}/api/cron/comment-automation`, {
      method: 'GET',
      headers: { 'X-Cron-Secret': process.env.CRON_SECRET ?? '' },
    });
    commentAutomationResult = await commentRes.json().catch(() => ({}));
  } catch {
    // non-fatal: scheduled posts are already done
  }

  const summary = {
    processed: due.length,
    results,
    commentAutomation: commentAutomationResult?.ok === true ? { ok: true, results: commentAutomationResult?.results } : { ok: false },
  };

  console.log('[Cron] process-scheduled done:', JSON.stringify(summary));
  return summary;
}
