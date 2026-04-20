import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { PostStatus } from '@prisma/client';
import { randomBytes } from 'crypto';
import { sendScheduledPostLinksEmail, sendScheduledPublishFailureEmail } from '@/lib/resend';
import { runPublishPostWorkflow } from '@/lib/publish-post-workflow';
import {
  postScalarsSelectWithMediaType,
  postScalarsSelectWithoutMediaType,
  prismaPostReadWithMediaTypeFallback,
} from '@/lib/prisma-post-media-type-fallback';

/** Enough for publish + email paths; comment-automation is no longer chained by default. */
export const maxDuration = 60;

const baseUrl = () =>
  (process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL || 'https://agent4socials.com').replace(/\/+$/, '');

/**
 * GET/POST /api/cron/process-scheduled
 * Call with header X-Cron-Secret: CRON_SECRET (or Authorization: Bearer CRON_SECRET).
 * Finds posts due now: scheduleDelivery=email_links -> send email with open link; scheduleDelivery=auto -> publish.
 * Optional: set PROCESS_SCHEDULED_CHAIN_COMMENT_AUTOMATION=1 to also call /api/cron/comment-automation (slow; prefer a second cron).
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

  // Wall-clock budget: stop publishing before the 60s maxDuration or the
  // external cron HTTP timeout (cron-job.org free = 30s).
  const BUDGET_MS = 22_000;
  const deadline = Date.now() + BUDGET_MS;

  // Process only 3 posts per run to limit concurrent serverless invocations
  // and prevent connection-pool exhaustion. Cron runs every minute, so
  // 3/min is enough to keep up. Older due posts are caught on the next run.
  const MAX_POSTS_PER_RUN = 3;

  let due;
  try {
    due = await prismaPostReadWithMediaTypeFallback((withMediaTypeCol) =>
      prisma.post.findMany({
        where: {
          status: PostStatus.SCHEDULED,
          scheduledAt: { lte: now },
        },
        orderBy: { scheduledAt: 'asc' },
        take: MAX_POSTS_PER_RUN,
        select: {
          ...(withMediaTypeCol ? postScalarsSelectWithMediaType() : postScalarsSelectWithoutMediaType()),
          user: { select: { id: true, email: true } },
          targets: true,
        },
      })
    );
  } catch (dbErr) {
    console.error('[Cron] Database error in process-scheduled:', dbErr);
    return { processed: 0, results: [], error: 'Database error' };
  }

  if (due.length > 0) {
    console.log('[Cron] process-scheduled: found', due.length, 'due post(s)');
  }

  const results: { postId: string; action: string; ok: boolean; error?: string }[] = [];

  for (const post of due) {
    if (Date.now() > deadline) {
      console.warn('[Cron] process-scheduled budget exhausted, deferring remaining posts');
      break;
    }

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
        select: { id: true },
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
          select: { id: true },
        });
      }
      if (!sendResult.ok && post.scheduledAt) {
        await sendScheduledPublishFailureEmail(userEmail, post.scheduledAt.toISOString(), sendResult.error || 'Failed to send scheduled email links');
      }
      results.push({ postId: post.id, action: 'email_links', ok: sendResult.ok, error: sendResult.error });
      continue;
    }

    // auto (or legacy null): publish in-process (same lambda + one DB pool slot).
    // Avoids N parallel HTTP /publish calls that exhaust Supabase pooler connections.
    try {
      const wf = await runPublishPostWorkflow({
        postId: post.id,
        isCron: true,
        userId: null,
        linkToken: null,
        requestBody: {},
        isDebug: false,
      });
      const body = wf.body as { ok?: boolean; message?: string; results?: unknown };
      const ok = wf.status === 200 && body.ok === true;
      const publishErrMsg =
        body.message ||
        (Array.isArray(body.results)
          ? (body.results as { error?: string }[])
              .map((r) => r.error)
              .filter(Boolean)
              .join('; ')
          : '') ||
        `HTTP ${wf.status}`;
      if (!ok && post.user?.email && post.scheduledAt) {
        await sendScheduledPublishFailureEmail(post.user.email, post.scheduledAt.toISOString(), publishErrMsg || 'Publish failed');
      }
      results.push({
        postId: post.id,
        action: 'publish',
        ok,
        error: ok ? undefined : publishErrMsg || 'Publish failed',
      });
    } catch (err) {
      const msg = (err as Error).message || 'Publish failed';
      if (post.user?.email && post.scheduledAt) {
        await sendScheduledPublishFailureEmail(post.user.email, post.scheduledAt.toISOString(), msg);
      }
      results.push({
        postId: post.id,
        action: 'publish',
        ok: false,
        error: msg,
      });
    }
  }

  // Chaining comment-automation doubles serverless invocations + DB connections and
  // routinely exceeds external cron HTTP limits (30s). Prefer a separate cron hitting
  // /api/cron/comment-automation. Set PROCESS_SCHEDULED_CHAIN_COMMENT_AUTOMATION=1 to restore.
  let commentAutomationResult: { ok?: boolean; results?: unknown } = {};
  const chainComment =
    process.env.PROCESS_SCHEDULED_CHAIN_COMMENT_AUTOMATION === '1' ||
    process.env.PROCESS_SCHEDULED_CHAIN_COMMENT_AUTOMATION === 'true';
  if (chainComment) {
    try {
      const commentRes = await fetch(`${baseUrl()}/api/cron/comment-automation`, {
        method: 'GET',
        headers: { 'X-Cron-Secret': process.env.CRON_SECRET ?? '' },
      });
      commentAutomationResult = await commentRes.json().catch(() => ({}));
    } catch {
      // non-fatal: scheduled posts are already done
    }
  }

  const summary = {
    processed: due.length,
    results,
    commentAutomation: chainComment
      ? (commentAutomationResult?.ok === true ? { ok: true, results: commentAutomationResult?.results } : { ok: false })
      : { ok: false, skipped: true as const, hint: 'Use a separate cron for /api/cron/comment-automation (recommended)' },
  };

  console.log('[Cron] process-scheduled done:', JSON.stringify(summary));
  return summary;
}
