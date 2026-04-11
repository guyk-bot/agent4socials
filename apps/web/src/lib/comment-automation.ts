import { prisma } from '@/lib/db';
import { PostStatus, Prisma } from '@prisma/client';
import axios, { type AxiosResponse } from 'axios';
import { facebookGraphBaseUrl } from '@/lib/meta-graph-insights';

export type CommentAutomation = {
  keywords: string[];
  replyTemplate?: string;
  replyTemplateByPlatform?: Record<string, string>;
  replyOnComment?: boolean;
  usePrivateReply?: boolean;
  instagramPublicReply?: boolean;
  instagramPrivateReply?: boolean;
  instagramDmTemplate?: string;
  tagCommenter?: boolean;
};

function getReplyText(ca: CommentAutomation, platform: string): string {
  const byPlatform = ca.replyTemplateByPlatform && typeof ca.replyTemplateByPlatform === 'object' ? ca.replyTemplateByPlatform : {};
  return (byPlatform[platform] ?? ca.replyTemplate ?? '').trim();
}

function envInt(name: string, fallback: number): number {
  const v = process.env[name];
  if (v == null || v === '') return fallback;
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type MetaGraphComment = {
  id: string;
  text?: string;
  message?: string;
  from?: { id?: string; username?: string; name?: string };
};

type MetaGraphCommentsPage = { data?: MetaGraphComment[]; paging?: { next?: string } };

/** Meta Graph: walk comment pages (IG + FB) with caps to support high-volume threads without missing the first page only. */
async function fetchMetaCommentsPaged(
  firstUrl: string,
  firstParams: Record<string, string>,
  maxPages: number,
  interPageDelayMs: number
): Promise<MetaGraphComment[]> {
  const out: MetaGraphComment[] = [];
  let url: string | null = firstUrl;
  let params: Record<string, string> | undefined = firstParams;
  for (let p = 0; p < maxPages; p++) {
    if (url == null || url === '') break;
    const pageUrl = url;
    const r: AxiosResponse<MetaGraphCommentsPage> = await axios.get(pageUrl, {
      ...(params ? { params } : {}),
      timeout: 18_000,
    });
    out.push(...(r.data?.data ?? []));
    const next: string | undefined = r.data?.paging?.next;
    url = next ?? null;
    params = undefined;
    if (url && interPageDelayMs > 0) await delay(interPageDelayMs);
  }
  return out;
}

export type CommentAutomationResult = {
  postId: string;
  targetId: string;
  platform: string;
  replied: number;
  errors: string[];
};

export type CommentAutomationSummary = {
  ok: true;
  results: CommentAutomationResult[];
  summary: {
    postsFound: number;
    postsScanned: number;
    /** True when more posted rows have automation than we processed this run. */
    postsTruncated: boolean;
    totalReplied: number;
    hint?: string;
    limits?: {
      maxPostsPerRun: number;
      maxMetaCommentPages: number;
      maxRepliesPerTargetPerRun: number;
      maxTwitterSearchPages: number;
      interPageDelayMs: number;
      interReplyDelayMs: number;
    };
  };
};

export async function executeCommentAutomation(): Promise<CommentAutomationSummary> {
  const results: CommentAutomationResult[] = [];

  // Stay under external cron HTTP limits (e.g. cron-job.org free = 30s max wait).
  const cronBudgetMs = envInt('COMMENT_AUTOMATION_CRON_BUDGET_MS', 24_000);
  const budgetDeadline = Date.now() + cronBudgetMs;
  const budgetExpired = () => Date.now() > budgetDeadline;

  const maxPostsPerRun = envInt('COMMENT_AUTOMATION_MAX_POSTS', 15);
  const maxMetaCommentPages = envInt('COMMENT_AUTOMATION_MAX_META_COMMENT_PAGES', 8);
  const maxRepliesPerTargetPerRun = envInt('COMMENT_AUTOMATION_MAX_REPLIES_PER_TARGET', 40);
  const maxTwitterSearchPages = envInt('COMMENT_AUTOMATION_MAX_TWITTER_PAGES', 8);
  const interPageDelayMs = envInt('COMMENT_AUTOMATION_INTER_PAGE_DELAY_MS', 120);
  const interReplyDelayMs = envInt('COMMENT_AUTOMATION_INTER_REPLY_DELAY_MS', 150);

  const postsAll = await prisma.post.count({
    where: { status: PostStatus.POSTED, commentAutomation: { not: Prisma.DbNull } },
  });

  const posts = await prisma.post.findMany({
    where: {
      status: PostStatus.POSTED,
      commentAutomation: { not: Prisma.DbNull },
    },
    orderBy: { updatedAt: 'desc' },
    take: maxPostsPerRun,
    include: {
      targets: {
        where: { platformPostId: { not: null }, status: PostStatus.POSTED },
        include: {
          socialAccount: { select: { id: true, platform: true, accessToken: true, platformUserId: true, credentialsJson: true } },
        },
      },
    },
  });

  if (posts.length === 0) {
    return {
      ok: true,
      results: [],
      summary: {
        postsFound: 0,
        postsScanned: 0,
        postsTruncated: false,
        totalReplied: 0,
        hint: 'No posted posts have keyword comment automation. In Composer create a post, enable section 4 (keywords + reply text), then publish it to X (or other platforms).',
      },
    };
  }

  const postsTruncated = postsAll > posts.length;

  let stoppedForCronBudget = false;

  automation: for (const post of posts) {
    if (budgetExpired()) {
      stoppedForCronBudget = true;
      break automation;
    }
    const ca = post.commentAutomation as CommentAutomation | null;
    if (!ca || !Array.isArray(ca.keywords) || ca.keywords.length === 0) continue;
    const keywords = ca.keywords.map((k) => (typeof k === 'string' ? k : '').toLowerCase()).filter(Boolean);
    if (keywords.length === 0) continue;

    for (const target of post.targets) {
      if (budgetExpired()) {
        stoppedForCronBudget = true;
        break automation;
      }
      if (!target.platformPostId || !target.socialAccount) continue;
      const platform = target.socialAccount.platform;
      const replyText = getReplyText(ca, platform);
      if (!replyText) continue;
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
          const creds = target.socialAccount.credentialsJson as Record<string, unknown> | null;
          const pageToken: string = (typeof creds?.pageToken === 'string' && creds.pageToken) ? creds.pageToken : token;
          const linkedPageId: string | null = typeof creds?.linkedPageId === 'string' ? creds.linkedPageId : null;
          const igAccountId = (target.socialAccount.platformUserId || '').trim();

          if (budgetExpired()) {
            stoppedForCronBudget = true;
            break automation;
          }
          const comments = await fetchMetaCommentsPaged(
            `${facebookGraphBaseUrl}/${platformPostId}/comments`,
            {
              fields: 'id,text,from{username}',
              access_token: token,
              limit: '50',
            },
            maxMetaCommentPages,
            interPageDelayMs
          );

          for (const c of comments) {
            if (budgetExpired()) {
              stoppedForCronBudget = true;
              break automation;
            }
            if (replied >= maxRepliesPerTargetPerRun) break;
            if (repliedSet.has(c.id)) continue;
            const text = (c.text ?? '').toLowerCase();
            if (!keywords.some((k) => text.includes(k))) continue;
            try {
              await prisma.commentAutomationReply.create({
                data: { postTargetId: target.id, platformCommentId: c.id },
              });
              repliedSet.add(c.id);
              const doPublicReply = typeof ca.instagramPublicReply === 'boolean'
                ? ca.instagramPublicReply
                : (ca.replyOnComment === true || (ca.replyOnComment === undefined && !ca.usePrivateReply));
              const doPrivateReply = typeof ca.instagramPrivateReply === 'boolean'
                ? ca.instagramPrivateReply
                : (ca.usePrivateReply === true);
              const mention = (ca.tagCommenter && c.from?.username) ? `@${c.from.username} ` : '';
              const finalReply = mention ? `${mention}${replyText}` : replyText;
              if (doPublicReply) {
                await axios.post(
                  `${facebookGraphBaseUrl}/${c.id}/replies`,
                  null,
                  { params: { message: finalReply, access_token: token }, timeout: 12_000 }
                );
              }
              if (doPrivateReply) {
                const dmText = (typeof ca.instagramDmTemplate === 'string' && ca.instagramDmTemplate.trim())
                  ? ca.instagramDmTemplate.trim()
                  : replyText;
                const msgSenderId = linkedPageId || igAccountId;
                if (msgSenderId) {
                  await axios.post(
                    `${facebookGraphBaseUrl}/${msgSenderId}/messages`,
                    {
                      recipient: { comment_id: c.id },
                      message: { text: dmText },
                    },
                    {
                      params: { access_token: pageToken },
                      headers: { 'Content-Type': 'application/json' },
                      timeout: 12_000,
                    }
                  );
                }
              }
              if (doPublicReply || doPrivateReply) {
                replied++;
                if (interReplyDelayMs > 0) await delay(interReplyDelayMs);
              }
            } catch (e) {
              await prisma.commentAutomationReply.deleteMany({
                where: { postTargetId: target.id, platformCommentId: c.id },
              }).catch(() => {});
              const axErr = e as { response?: { data?: unknown; status?: number } };
              const errMsg = axErr.response?.data ? JSON.stringify(axErr.response.data) : ((e as Error)?.message ?? String(e));
              errors.push(errMsg.slice(0, 300));
            }
          }
        } else if (platform === 'FACEBOOK') {
          if (budgetExpired()) {
            stoppedForCronBudget = true;
            break automation;
          }
          const comments = await fetchMetaCommentsPaged(
            `${facebookGraphBaseUrl}/${platformPostId}/comments`,
            {
              fields: 'id,message,from{name}',
              access_token: token,
              limit: '50',
            },
            maxMetaCommentPages,
            interPageDelayMs
          );

          for (const c of comments) {
            if (budgetExpired()) {
              stoppedForCronBudget = true;
              break automation;
            }
            if (replied >= maxRepliesPerTargetPerRun) break;
            if (repliedSet.has(c.id)) continue;
            const text = (c.message ?? '').toLowerCase();
            if (!keywords.some((k) => text.includes(k))) continue;
            try {
              await prisma.commentAutomationReply.create({
                data: { postTargetId: target.id, platformCommentId: c.id },
              });
              repliedSet.add(c.id);
              const mention = (ca.tagCommenter && c.from?.name) ? `${c.from.name}, ` : '';
              const finalReply = mention ? `${mention}${replyText}` : replyText;
              await axios.post(
                `${facebookGraphBaseUrl}/${c.id}/comments`,
                null,
                { params: { message: finalReply, access_token: token }, timeout: 12_000 }
              );
              replied++;
              if (interReplyDelayMs > 0) await delay(interReplyDelayMs);
            } catch (e) {
              await prisma.commentAutomationReply.deleteMany({
                where: { postTargetId: target.id, platformCommentId: c.id },
              }).catch(() => {});
              const axErr = e as { response?: { data?: unknown; status?: number } };
              const errMsg = axErr.response?.data ? JSON.stringify(axErr.response.data) : ((e as Error)?.message ?? String(e));
              errors.push(errMsg.slice(0, 300));
            }
          }
        } else if (platform === 'TWITTER') {
          const ourAuthorId = (target.socialAccount.platformUserId ?? '').trim();
          const tweets: Array<{ id: string; text?: string; author_id?: string }> = [];
          let nextToken: string | undefined;
          try {
            for (let page = 0; page < maxTwitterSearchPages; page++) {
              if (budgetExpired()) {
                stoppedForCronBudget = true;
                break automation;
              }
              const params: Record<string, string | number> = {
                query: `conversation_id:${platformPostId} is:reply`,
                'tweet.fields': 'text,author_id',
                max_results: 100,
              };
              if (nextToken) params.next_token = nextToken;
              const searchRes = await axios.get<{
                data?: Array<{ id: string; text?: string; author_id?: string }>;
                errors?: Array<{ message?: string }>;
                meta?: { next_token?: string };
              }>('https://api.twitter.com/2/tweets/search/recent', {
                params,
                headers: { Authorization: `Bearer ${token}` },
                timeout: 15_000,
              });
              const errs = searchRes.data?.errors;
              if (errs?.length) {
                errors.push(`X Search API: ${errs.map((e) => e.message ?? '').join('; ')}`);
                break;
              }
              const raw = searchRes.data?.data ?? [];
              const fromOthers = ourAuthorId ? raw.filter((t) => t.author_id !== ourAuthorId) : raw;
              const seen = new Set(tweets.map((t) => t.id));
              for (const t of fromOthers) {
                if (!seen.has(t.id)) {
                  seen.add(t.id);
                  tweets.push(t);
                }
              }
              nextToken = searchRes.data?.meta?.next_token;
              if (!nextToken) break;
              if (interPageDelayMs > 0) await delay(interPageDelayMs);
            }
          } catch (e: unknown) {
            const ax = e as { response?: { status?: number; data?: { detail?: string; errors?: Array<{ message?: string }> } } };
            const status = ax.response?.status;
            const body = ax.response?.data;
            const msg = body?.detail ?? (Array.isArray(body?.errors) ? body.errors.map((x) => x.message).join('; ') : null) ?? (e as Error)?.message ?? String(e);
            errors.push(`X Search: ${status ?? ''} ${msg}`.trim().slice(0, 200));
          }
          for (const t of tweets) {
            if (budgetExpired()) {
              stoppedForCronBudget = true;
              break automation;
            }
            if (replied >= maxRepliesPerTargetPerRun) break;
            if (repliedSet.has(t.id)) continue;
            const text = (t.text ?? '').toLowerCase();
            if (!keywords.some((k) => text.includes(k))) continue;
            try {
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
              if (interReplyDelayMs > 0) await delay(interReplyDelayMs);
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
  const limits = {
    maxPostsPerRun,
    maxMetaCommentPages,
    maxRepliesPerTargetPerRun,
    maxTwitterSearchPages,
    interPageDelayMs,
    interReplyDelayMs,
  };

  let hint: string | undefined;
  if (stoppedForCronBudget) {
    hint =
      'Stopped early to stay within the cron HTTP time budget (~24s by default for 30s schedulers). Run again soon, or set COMMENT_AUTOMATION_CRON_BUDGET_MS if your scheduler allows longer waits.';
  }
  if (hasErrors) {
    hint = hint
      ? `${hint} Also: one or more platforms returned errors (e.g. X Search may require a paid plan). Check errors below.`
      : 'One or more platforms returned errors (e.g. X Search may require a paid plan or app in a Project). Check errors below.';
  } else if (postsTruncated && !stoppedForCronBudget) {
    hint = `More than ${maxPostsPerRun} posts have automation enabled; this run processed the ${maxPostsPerRun} most recently updated. Run cron again (or more often) to cover the rest. Tune COMMENT_AUTOMATION_MAX_POSTS in Vercel.`;
  }

  return {
    ok: true,
    results,
    summary: {
      postsFound: postsAll,
      postsScanned: posts.length,
      postsTruncated,
      totalReplied,
      hint,
      limits,
    },
  };
}
