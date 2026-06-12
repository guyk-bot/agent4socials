import type { Platform } from '@prisma/client';
import axios from 'axios';
import { prisma } from '@/lib/db';
import {
  isBrandContextFunnelStep,
  normalizeLandingChatText,
  type LandingChatContext,
  wantsFunnelInAppAction,
} from '@/lib/chat-hero-script';
import {
  matchesInsightsIntent,
  matchesPublishIntent,
} from '@/lib/chat-intent-detection';
import { getFunnelSessionByToken } from '@/lib/funnel-guest';
import { publishToThreads } from '@/lib/threads/publish';
import { getValidThreadsToken } from '@/lib/threads/threads-token';
import { buildThreadsInsightsBundle } from '@/lib/threads/analytics-bundle';
import { instagramGraphHostBaseUrl } from '@/lib/meta-graph-insights';

export type FunnelGuestActionResponse = {
  text: string;
  source: 'funnel_action';
  requireSignup?: boolean;
  funnelStats?: { value: string; label: string }[];
};

function platformLabel(platform: Platform): string {
  const map: Record<string, string> = {
    INSTAGRAM: 'Instagram',
    TIKTOK: 'TikTok',
    YOUTUBE: 'YouTube',
    FACEBOOK: 'Facebook',
    TWITTER: 'X',
    LINKEDIN: 'LinkedIn',
    PINTEREST: 'Pinterest',
    THREADS: 'Threads',
  };
  return map[platform] ?? platform;
}

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 10_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(Math.max(0, Math.round(n)));
}

function signupAfterPublishMessage(): string {
  return 'That was your one free post from the landing chat. Sign in free to schedule more, publish to every platform, and use the full Composer.';
}

function signupAfterAnalyticsMessage(): string {
  return 'That was your one free analytics snapshot here. Sign in to open the full dashboard with trends, exports, and AI insights.';
}

function noAccountMessage(): string {
  return 'Connect a platform first using the buttons above, then you can try one free post and one free analytics snapshot here before signing in.';
}

export function wantsGuestAnalyticsRequest(text: string): boolean {
  const lower = normalizeLandingChatText(text);
  return (
    matchesInsightsIntent(text) ||
    /\b(report|analytics|insights|activity|performance|metrics|dashboard|how (?:am i|are my)|best post|top post|engagement|followers)\b/.test(
      lower
    )
  );
}

export function isLikelyCapabilityQuestion(text: string): boolean {
  const lower = normalizeLandingChatText(text);
  return (
    /\?$/.test(lower.trim()) &&
    /\b(can i|can you|could i|is it possible|from here|directly|without sign|do i need)\b/.test(lower)
  );
}

/** Extract post caption when the user sends content, not just a question. */
export function extractPublishCaption(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  const quoted = trimmed.match(/["“](.+?)["”]/);
  if (quoted?.[1]?.trim()) return quoted[1].trim().slice(0, 500);

  const prefixed = trimmed.match(/\b(?:post|publish|thread|tweet)(?:\s+this)?:?\s+(.+)/i);
  if (prefixed?.[1]?.trim()) return prefixed[1].trim().slice(0, 500);

  if (isLikelyCapabilityQuestion(trimmed)) return null;
  if (wantsFunnelInAppAction(trimmed) || matchesPublishIntent(trimmed)) return null;
  if (wantsGuestAnalyticsRequest(trimmed)) return null;

  if (trimmed.length >= 12 && trimmed.length <= 500) return trimmed;
  return null;
}

export function wantsGuestPublishAttempt(ctx: LandingChatContext): boolean {
  if (!ctx.connectedAccountId) return false;
  if (!isBrandContextFunnelStep(ctx) && ctx.funnelFlowStep !== 'free_chat') {
    return wantsFunnelInAppAction(ctx.text) || matchesPublishIntent(ctx.text);
  }
  return (
    wantsFunnelInAppAction(ctx.text) ||
    matchesPublishIntent(ctx.text) ||
    extractPublishCaption(ctx.text) != null
  );
}

async function loadGuestAccount(guestUserId: string, accountId: string) {
  return prisma.socialAccount.findFirst({
    where: {
      id: accountId,
      userId: guestUserId,
      status: 'connected',
    },
  });
}

async function markGuestPublishUsed(sessionId: string): Promise<void> {
  await prisma.funnelSession.update({
    where: { id: sessionId },
    data: { guestPublishUsedAt: new Date() },
  });
}

async function markGuestAnalyticsUsed(sessionId: string): Promise<void> {
  await prisma.funnelSession.update({
    where: { id: sessionId },
    data: { guestAnalyticsUsedAt: new Date() },
  });
}

type GuestSocialAccount = {
  id: string;
  accessToken: string;
  refreshToken: string | null;
  expiresAt: Date | null;
  platformUserId: string;
  username: string | null;
};

async function publishGuestTextPost(
  platform: Platform,
  account: GuestSocialAccount,
  caption: string
): Promise<{ ok: true; platformPostId?: string } | { ok: false; error: string }> {
  const text = caption.trim().slice(0, 500);
  if (!text) return { ok: false, error: 'Add the text you want to post.' };

  if (platform === 'THREADS') {
    const token = await getValidThreadsToken(account);
    const result = await publishToThreads({ accessToken: token, text });
    if (!result.ok) return result;
    return { ok: true, platformPostId: result.platformPostId };
  }

  if (platform === 'TWITTER') {
    try {
      const res = await axios.post(
        'https://api.twitter.com/2/tweets',
        { text: text.slice(0, 280) },
        {
          headers: {
            Authorization: `Bearer ${account.accessToken}`,
            'Content-Type': 'application/json',
          },
          timeout: 20_000,
          validateStatus: () => true,
        }
      );
      const tweetId = (res.data as { data?: { id?: string } })?.data?.id;
      if (res.status >= 400 || !tweetId) {
        const msg =
          (res.data as { detail?: string; title?: string })?.detail ||
          (res.data as { errors?: Array<{ message?: string }> })?.errors?.[0]?.message ||
          `X publish failed (HTTP ${res.status})`;
        return { ok: false, error: String(msg).slice(0, 300) };
      }
      return { ok: true, platformPostId: tweetId };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : 'X publish failed' };
    }
  }

  return {
    ok: false,
    error: `One free landing publish supports text posts on Threads and X for now. Sign in to publish to ${platformLabel(platform)} from Composer.`,
  };
}

async function fetchGuestAnalytics(
  platform: Platform,
  account: GuestSocialAccount
): Promise<{ items: { value: string; label: string }[]; summary: string }> {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const until = new Date().toISOString().slice(0, 10);
  const label = platformLabel(platform);
  const handle = account.username ? `@${account.username}` : label;

  if (platform === 'THREADS') {
    const token = await getValidThreadsToken(account);
    const bundle = await buildThreadsInsightsBundle(token, since, until);
    const items = [
      { value: formatCount(bundle.viewsTotal), label: 'Views (30d)' },
      { value: formatCount(bundle.likesTotal), label: 'Likes (30d)' },
      { value: formatCount(bundle.repliesTotal), label: 'Replies (30d)' },
      {
        value: formatCount(bundle.repostsTotal + bundle.quotesTotal),
        label: 'Reposts + quotes (30d)',
      },
    ];
    const summary = `Here is a 30-day snapshot for ${handle} on Threads. Views: ${formatCount(bundle.viewsTotal)}, likes: ${formatCount(bundle.likesTotal)}, replies: ${formatCount(bundle.repliesTotal)}. Sign in for full charts and exports.`;
    return { items, summary };
  }

  if (platform === 'INSTAGRAM') {
    const res = await axios.get<{ followers_count?: number; media_count?: number }>(
      `${instagramGraphHostBaseUrl}/${account.platformUserId}`,
      {
        params: {
          fields: 'followers_count,media_count,username',
          access_token: account.accessToken,
        },
        timeout: 15_000,
        validateStatus: () => true,
      }
    );
    const followers = res.data?.followers_count ?? 0;
    const posts = res.data?.media_count ?? 0;
    const items = [
      { value: formatCount(followers), label: 'Followers' },
      { value: formatCount(posts), label: 'Posts' },
    ];
    return {
      items,
      summary: `${handle} on Instagram: ${formatCount(followers)} followers and ${formatCount(posts)} posts. Sign in for engagement trends and post-level analytics.`,
    };
  }

  if (platform === 'TWITTER') {
    const res = await axios.get<{ data?: { public_metrics?: { followers_count?: number; tweet_count?: number } } }>(
      `https://api.twitter.com/2/users/${account.platformUserId}`,
      {
        params: { 'user.fields': 'public_metrics' },
        headers: { Authorization: `Bearer ${account.accessToken}` },
        timeout: 15_000,
        validateStatus: () => true,
      }
    );
    const metrics = res.data?.data?.public_metrics;
    const items = [
      { value: formatCount(metrics?.followers_count ?? 0), label: 'Followers' },
      { value: formatCount(metrics?.tweet_count ?? 0), label: 'Posts' },
    ];
    return {
      items,
      summary: `${handle} on X: ${formatCount(metrics?.followers_count ?? 0)} followers. Sign in for impressions, engagement, and AI summaries.`,
    };
  }

  const posts = await prisma.importedPost.count({ where: { socialAccountId: account.id } });
  const items = [{ value: formatCount(posts), label: 'Synced posts' }];
  return {
    items,
    summary: `Quick snapshot for ${handle} on ${label}: ${formatCount(posts)} posts synced in iZop. Sign in for full analytics and reports.`,
  };
}

export async function runFunnelGuestPublish(
  funnelToken: string,
  caption: string
): Promise<FunnelGuestActionResponse> {
  const session = await getFunnelSessionByToken(funnelToken);
  if (!session?.connectedAccountId) {
    return { text: noAccountMessage(), source: 'funnel_action' };
  }
  if (session.guestPublishUsedAt) {
    return { text: signupAfterPublishMessage(), source: 'funnel_action', requireSignup: true };
  }

  const account = await loadGuestAccount(session.guestUserId, session.connectedAccountId);
  if (!account) {
    return { text: 'Your connected account could not be found. Reconnect the platform and try again.', source: 'funnel_action' };
  }

  const result = await publishGuestTextPost(account.platform, account, caption);
  if (!result.ok) {
    return { text: result.error, source: 'funnel_action' };
  }

  await markGuestPublishUsed(session.id);
  const label = platformLabel(account.platform);
  return {
    text: `Published to your ${label} account. ${signupAfterPublishMessage()}`,
    source: 'funnel_action',
    requireSignup: true,
  };
}

export async function runFunnelGuestAnalytics(
  funnelToken: string
): Promise<FunnelGuestActionResponse> {
  const session = await getFunnelSessionByToken(funnelToken);
  if (!session?.connectedAccountId) {
    return { text: noAccountMessage(), source: 'funnel_action' };
  }
  if (session.guestAnalyticsUsedAt) {
    return { text: signupAfterAnalyticsMessage(), source: 'funnel_action', requireSignup: true };
  }

  const account = await loadGuestAccount(session.guestUserId, session.connectedAccountId);
  if (!account) {
    return { text: 'Your connected account could not be found. Reconnect the platform and try again.', source: 'funnel_action' };
  }

  try {
    const { items, summary } = await fetchGuestAnalytics(account.platform, account);
    await markGuestAnalyticsUsed(session.id);
    return {
      text: summary,
      source: 'funnel_action',
      funnelStats: items,
      requireSignup: true,
    };
  } catch (e) {
    return {
      text: e instanceof Error ? e.message : 'Could not load analytics right now. Try again in a moment.',
      source: 'funnel_action',
    };
  }
}

/** Handle publish/analytics intents in landing chat (one free action each). */
export async function tryHandleFunnelGuestAction(
  ctx: LandingChatContext,
  funnelToken: string | null
): Promise<FunnelGuestActionResponse | null> {
  if (!funnelToken?.trim() || !ctx.connectedAccountId) return null;

  const session = await getFunnelSessionByToken(funnelToken);
  if (!session) return null;

  const analyticsIntent = wantsGuestAnalyticsRequest(ctx.text);
  const publishIntent = wantsGuestPublishAttempt(ctx);
  const caption = extractPublishCaption(ctx.text);

  if (analyticsIntent && !publishIntent) {
    const wantsImmediateAnalytics = /\b(show|send|pull|get me|give me|load|report|snapshot)\b/i.test(
      normalizeLandingChatText(ctx.text)
    );
    if (
      isLikelyCapabilityQuestion(ctx.text) &&
      !wantsImmediateAnalytics &&
      !session.guestAnalyticsUsedAt
    ) {
      const label = session.connectedPlatform ? platformLabel(session.connectedPlatform) : 'your account';
      return {
        text: `Yes. You get one free analytics snapshot for ${label} right here. Say "show my analytics" or tap See analytics above and I will pull your numbers.`,
        source: 'funnel_action',
      };
    }
    return runFunnelGuestAnalytics(funnelToken);
  }

  if (publishIntent) {
    if (session.guestPublishUsedAt) {
      return { text: signupAfterPublishMessage(), source: 'funnel_action', requireSignup: true };
    }
    if (isLikelyCapabilityQuestion(ctx.text) || (!caption && (wantsFunnelInAppAction(ctx.text) || matchesPublishIntent(ctx.text)))) {
      const label = session.connectedPlatform ? platformLabel(session.connectedPlatform) : 'your connected account';
      return {
        text: `Yes. You get one free text post to ${label} from this chat. Send the exact caption you want published (for example: "Post this: Excited to share my latest update!").`,
        source: 'funnel_action',
      };
    }
    if (caption) {
      return runFunnelGuestPublish(funnelToken, caption);
    }
  }

  return null;
}
