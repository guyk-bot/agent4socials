import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { PostStatus, Prisma } from '@prisma/client';
import axios from 'axios';

/**
 * GET/POST /api/cron/comment-automation
 * Call with header X-Cron-Secret: CRON_SECRET.
 * Finds posted posts with commentAutomation, fetches comments per platform,
 * replies to comments that match keywords (once per comment), using per-platform reply text.
 */
export async function GET(request: NextRequest) {
  return runCommentAutomation(request);
}

export async function POST(request: NextRequest) {
  return runCommentAutomation(request);
}

type CommentAutomation = {
  keywords: string[];
  replyTemplate?: string;
  replyTemplateByPlatform?: Record<string, string>;
  replyOnComment?: boolean;
  usePrivateReply?: boolean;
};

function getReplyText(ca: CommentAutomation, platform: string): string {
  const byPlatform = ca.replyTemplateByPlatform && typeof ca.replyTemplateByPlatform === 'object' ? ca.replyTemplateByPlatform : {};
  return (byPlatform[platform] ?? ca.replyTemplate ?? '').trim();
}

async function runCommentAutomation(request: NextRequest) {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ message: 'DATABASE_URL required' }, { status: 503 });
  }
  const cronSecret =
    request.headers.get('X-Cron-Secret') ||
    request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ||
    request.nextUrl.searchParams.get('secret');
  if (!process.env.CRON_SECRET || cronSecret !== process.env.CRON_SECRET) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const results: { postId: string; targetId: string; platform: string; replied: number; errors: string[] }[] = [];

  try {
    const posts = await prisma.post.findMany({
      where: {
        status: PostStatus.POSTED,
        commentAutomation: { not: Prisma.DbNull },
      },
      include: {
        targets: {
          where: { platformPostId: { not: null }, status: PostStatus.POSTED },
          include: {
            socialAccount: { select: { id: true, platform: true, accessToken: true, platformUserId: true } },
          },
        },
      },
    });

    if (posts.length === 0) {
      return NextResponse.json({
        ok: true,
        results: [],
        summary: { postsFound: 0, totalReplied: 0, hint: 'No posted posts have keyword comment automation. In Composer create a post, enable section 4 (keywords + reply text), then publish it to X (or other platforms).' },
      });
    }

    for (const post of posts) {
      const ca = post.commentAutomation as CommentAutomation | null;
      if (!ca || !Array.isArray(ca.keywords) || ca.keywords.length === 0) continue;
      const keywords = ca.keywords.map((k) => (typeof k === 'string' ? k : '').toLowerCase()).filter(Boolean);
      if (keywords.length === 0) continue;

      for (const target of post.targets) {
        if (!target.platformPostId || !target.socialAccount) continue;
        const platform = target.socialAccount.platform;
        const replyText = getReplyText(ca, platform);
        if (!replyText) continue;
        // Keyword comment automation is not offered for LinkedIn
        if (platform === 'LINKEDIN') continue;

        const token = target.socialAccount.accessToken;
        const platformPostId = target.platformPostId;
        const repliedIds = await prisma.commentAutomationReply.findMany({
          where: { postTargetId: target.id },
          select: { platformCommentId: true },
        });
        const repliedSet = new Set(repliedIds.map((r) => r.platformCommentId));
        const errors: string[] = [];
        let replied = 0;

        try {
          if (platform === 'INSTAGRAM') {
            const res = await axios.get<{ data?: Array<{ id: string; text?: string }> }>(
              `https://graph.facebook.com/v18.0/${platformPostId}/comments`,
              { params: { fields: 'id,text', access_token: token } }
            );
            const comments = res.data?.data ?? [];
            for (const c of comments) {
              if (repliedSet.has(c.id)) continue;
              const text = (c.text ?? '').toLowerCase();
              if (!keywords.some((k) => text.includes(k))) continue;
              try {
                await prisma.commentAutomationReply.create({
                  data: { postTargetId: target.id, platformCommentId: c.id },
                });
                repliedSet.add(c.id);
                const doPublicReply = ca.replyOnComment === true || (ca.replyOnComment === undefined && !ca.usePrivateReply);
                const doPrivateReply = ca.usePrivateReply === true;
                if (doPublicReply) {
                  await axios.post(
                    `https://graph.facebook.com/v18.0/${c.id}/replies`,
                    new URLSearchParams({ message: replyText }),
                    { params: { access_token: token }, headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
                  );
                }
                if (doPrivateReply) {
                  await axios.post(
                    `https://graph.facebook.com/v18.0/${c.id}/private_reply`,
                    new URLSearchParams({ message: replyText }),
                    { params: { access_token: token }, headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
                  );
                }
                if (doPublicReply || doPrivateReply) replied++;
              } catch (e) {
                await prisma.commentAutomationReply.deleteMany({
                  where: { postTargetId: target.id, platformCommentId: c.id },
                }).catch(() => {});
                errors.push((e as Error)?.message ?? String(e));
              }
            }
          } else if (platform === 'FACEBOOK') {
            const res = await axios.get<{ data?: Array<{ id: string; message?: string }> }>(
              `https://graph.facebook.com/v18.0/${platformPostId}/comments`,
              { params: { fields: 'id,message', access_token: token } }
            );
            const comments = res.data?.data ?? [];
            for (const c of comments) {
              if (repliedSet.has(c.id)) continue;
              const text = (c.message ?? '').toLowerCase();
              if (!keywords.some((k) => text.includes(k))) continue;
              try {
                await prisma.commentAutomationReply.create({
                  data: { postTargetId: target.id, platformCommentId: c.id },
                });
                repliedSet.add(c.id);
                await axios.post(
                  `https://graph.facebook.com/v18.0/${c.id}/comments`,
                  new URLSearchParams({ message: replyText }),
                  { params: { access_token: token }, headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
                );
                replied++;
              } catch (e) {
                await prisma.commentAutomationReply.deleteMany({
                  where: { postTargetId: target.id, platformCommentId: c.id },
                }).catch(() => {});
                errors.push((e as Error)?.message ?? String(e));
              }
            }
          } else if (platform === 'TWITTER') {
            const ourAuthorId = (target.socialAccount.platformUserId ?? '').trim();
            let tweets: Array<{ id: string; text?: string; author_id?: string }> = [];
            try {
              const searchRes = await axios.get<{ data?: Array<{ id: string; text?: string; author_id?: string }>; errors?: Array<{ message?: string }> }>(
                'https://api.twitter.com/2/tweets/search/recent',
                {
                  params: {
                    query: `conversation_id:${platformPostId} is:reply`,
                    'tweet.fields': 'text,author_id',
                    max_results: 50,
                  },
                  headers: { Authorization: `Bearer ${token}` },
                }
              );
              const errs = searchRes.data?.errors;
              if (errs?.length) {
                errors.push(`X Search API: ${errs.map((e) => e.message ?? '').join('; ')}`);
              } else {
                const raw = searchRes.data?.data ?? [];
                // Exclude our own replies so we never reply to ourselves (avoids duplicate chains)
                const fromOthers = ourAuthorId ? raw.filter((t) => t.author_id !== ourAuthorId) : raw;
                // Dedupe by id in case API returns duplicates
                const seen = new Set<string>();
                tweets = fromOthers.filter((t) => {
                  if (seen.has(t.id)) return false;
                  seen.add(t.id);
                  return true;
                });
              }
            } catch (e: unknown) {
              const ax = e as { response?: { status?: number; data?: { detail?: string; errors?: Array<{ message?: string }> } } };
              const status = ax.response?.status;
              const body = ax.response?.data;
              const msg = body?.detail ?? (Array.isArray(body?.errors) ? body.errors.map((x) => x.message).join('; ') : null) ?? (e as Error)?.message ?? String(e);
              errors.push(`X Search: ${status ?? ''} ${msg}`.trim().slice(0, 200));
            }
            for (const t of tweets) {
              if (repliedSet.has(t.id)) continue;
              const text = (t.text ?? '').toLowerCase();
              if (!keywords.some((k) => text.includes(k))) continue;
              try {
                // Mark as replied before sending so overlapping cron runs don't double-reply
                await prisma.commentAutomationReply.create({
                  data: { postTargetId: target.id, platformCommentId: t.id },
                });
                repliedSet.add(t.id);
                await axios.post(
                  'https://api.twitter.com/2/tweets',
                  { text: replyText.slice(0, 280), reply: { in_reply_to_tweet_id: t.id } },
                  { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }
                );
                replied++;
              } catch (e) {
                await prisma.commentAutomationReply.deleteMany({
                  where: { postTargetId: target.id, platformCommentId: t.id },
                }).catch(() => {});
                errors.push((e as Error)?.message ?? String(e));
              }
            }
          }
        } catch (e) {
          errors.push((e as Error)?.message ?? String(e));
        }
        results.push({ postId: post.id, targetId: target.id, platform, replied, errors: errors.slice(0, 5) });
      }
    }

    const totalReplied = results.reduce((s, r) => s + r.replied, 0);
    const hasErrors = results.some((r) => r.errors.length > 0);
    return NextResponse.json({
      ok: true,
      results,
      summary: {
        postsFound: posts.length,
        totalReplied,
        hint: hasErrors
          ? 'One or more platforms returned errors (e.g. X Search may require a paid plan or app in a Project). Check errors below.'
          : undefined,
      },
    });
  } catch (e) {
    console.error('[Cron] comment-automation error:', e);
    return NextResponse.json(
      { message: 'Cron failed', error: (e as Error)?.message ?? String(e) },
      { status: 500 }
    );
  }
}
