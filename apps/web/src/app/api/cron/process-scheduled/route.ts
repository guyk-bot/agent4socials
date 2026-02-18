import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { PostStatus } from '@prisma/client';
import { randomBytes } from 'crypto';
import { sendScheduledPostLinksEmail } from '@/lib/resend';

const baseUrl = () =>
  (process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL || 'https://agent4socials.com').replace(/\/+$/, '');

/**
 * GET/POST /api/cron/process-scheduled
 * Call with header X-Cron-Secret: CRON_SECRET (or Authorization: Bearer CRON_SECRET).
 * Finds posts due now: scheduleDelivery=email_links -> send email with open link; scheduleDelivery=auto -> publish.
 */
export async function GET(request: NextRequest) {
  return processScheduled(request);
}

export async function POST(request: NextRequest) {
  return processScheduled(request);
}

async function processScheduled(request: NextRequest) {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ message: 'DATABASE_URL required' }, { status: 503 });
  }
  const cronSecret = request.headers.get('X-Cron-Secret') || request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!process.env.CRON_SECRET || cronSecret !== process.env.CRON_SECRET) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const now = new Date();
  const due = await prisma.post.findMany({
    where: {
      status: PostStatus.SCHEDULED,
      scheduledAt: { lte: now },
    },
    include: {
      user: { select: { id: true, email: true } },
      targets: true,
    },
  });

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
          scheduleEmailSentAt: now,
        },
      });
      const openLink = `${baseUrl()}/post/${post.id}/open?t=${encodeURIComponent(token)}`;
      const userEmail = post.user.email;
      if (!userEmail) {
        results.push({ postId: post.id, action: 'email_links', ok: false, error: 'User has no email' });
        continue;
      }
      const sent = await sendScheduledPostLinksEmail(userEmail, openLink);
      results.push({ postId: post.id, action: 'email_links', ok: sent });
      continue;
    }

    // auto (or legacy null): trigger publish
    try {
      const res = await fetch(`${baseUrl()}/api/posts/${post.id}/publish`, {
        method: 'POST',
        headers: { 'X-Cron-Secret': process.env.CRON_SECRET },
      });
      const ok = res.ok;
      const body = await res.json().catch(() => ({}));
      results.push({
        postId: post.id,
        action: 'publish',
        ok,
        error: ok ? undefined : (body.message || body.error || res.statusText),
      });
    } catch (err) {
      results.push({
        postId: post.id,
        action: 'publish',
        ok: false,
        error: (err as Error).message,
      });
    }
  }

  return NextResponse.json({ processed: due.length, results });
}
