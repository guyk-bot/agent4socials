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

const baseUrl = () =>
  (process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL || 'https://agent4socials.com').replace(/\/+$/, '');

export type ProcessScheduledSummary = {
  processed: number;
  results: { postId: string; action: string; ok: boolean; error?: string }[];
  error?: string;
  commentAutomation?: { ok: boolean; results?: unknown; skipped?: true; hint?: string };
};

/**
 * Due scheduled posts: email_links flow and in-process publish.
 * @param opts.chainCommentAutomation when true, also HTTP GETs `/api/cron/comment-automation` after publishes (legacy). Prefer `/api/cron/fast-tick` for combined runs.
 */
export async function executeProcessScheduled(opts?: { chainCommentAutomation?: boolean }): Promise<ProcessScheduledSummary> {
  const chainComment = opts?.chainCommentAutomation === true;
  const now = new Date();

  const BUDGET_MS = 22_000;
  const deadline = Date.now() + BUDGET_MS;
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

  let commentAutomationResult: { ok?: boolean; results?: unknown } = {};
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

  const summary: ProcessScheduledSummary = {
    processed: due.length,
    results,
    commentAutomation: chainComment
      ? (commentAutomationResult?.ok === true ? { ok: true, results: commentAutomationResult?.results } : { ok: false })
      : { ok: false, skipped: true as const, hint: 'Use /api/cron/fast-tick or a separate cron for /api/cron/comment-automation (recommended)' },
  };

  console.log('[Cron] process-scheduled done:', JSON.stringify(summary));
  return summary;
}
