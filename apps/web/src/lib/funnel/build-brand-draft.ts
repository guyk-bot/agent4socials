import type { Platform } from '@prisma/client';
import type { BrandContextRecord } from '@/lib/brand-context-utils';
import { prisma } from '@/lib/db';
import { defaultBrandContextDraft, platformLabelFromId } from '@/lib/funnel-chat-flow';
import type { ChatHeroPlatformId } from '@/lib/chat-hero-script';
import { fetchThreadsProfile, threadsGet } from '@/lib/threads/threads-api';
import { getValidThreadsToken } from '@/lib/threads/threads-token';

function platformToFunnelId(platform: Platform): ChatHeroPlatformId {
  const map: Record<Platform, ChatHeroPlatformId> = {
    INSTAGRAM: 'instagram',
    TIKTOK: 'tiktok',
    YOUTUBE: 'youtube',
    FACEBOOK: 'facebook',
    TWITTER: 'x',
    LINKEDIN: 'linkedin',
    THREADS: 'threads',
    PINTEREST: 'pinterest',
  };
  return map[platform] ?? 'instagram';
}

function clip(text: string, max: number): string {
  const t = text.replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1).trim()}…`;
}

function joinSamples(lines: string[], maxItems: number, maxLen: number): string {
  return lines
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, maxItems)
    .map((l) => clip(l, maxLen))
    .join('\n');
}

async function buildThreadsBrandDraft(
  account: { id: string; accessToken: string; expiresAt: Date | null; username: string },
  platformLabel: string
): Promise<BrandContextRecord> {
  const token = await getValidThreadsToken(account);
  const profile = await fetchThreadsProfile(token);
  const username = profile?.username ?? account.username;
  const bio = profile?.threads_biography?.trim() ?? '';
  const displayName = profile?.name?.trim() ?? username;

  const postTexts: string[] = [];
  const postRows: { id?: string; text?: string }[] = [];
  const { status, data } = await threadsGet<{ data?: { id?: string; text?: string }[] }>('me/threads', token, {
    fields: 'id,text',
    limit: 12,
  });
  if (status === 200 && Array.isArray(data?.data)) {
    for (const row of data.data) {
      postRows.push(row);
      if (row.text?.trim()) postTexts.push(row.text.trim());
    }
  }

  const replyTexts: string[] = [];
  const firstPostId = postRows.find((r) => r.id)?.id;
  if (firstPostId) {
    const replies = await threadsGet<{ data?: { text?: string; username?: string }[] }>(
      `${firstPostId}/replies`,
      token,
      { fields: 'text,username', limit: 8 }
    );
    if (replies.status === 200 && Array.isArray(replies.data?.data)) {
      for (const row of replies.data.data) {
        if (row.text?.trim()) {
          replyTexts.push(row.username ? `@${row.username}: ${row.text.trim()}` : row.text.trim());
        }
      }
    }
  }

  const productDescription =
    bio ||
    `Content and offers from @${username} (${displayName}) on ${platformLabel}.`;

  const toneExamplesParts: string[] = [];
  if (postTexts.length > 0) {
    toneExamplesParts.push(`Recent posts:\n${joinSamples(postTexts, 4, 160)}`);
  }
  if (replyTexts.length > 0) {
    toneExamplesParts.push(`Recent replies on your posts:\n${joinSamples(replyTexts, 3, 120)}`);
  }

  return {
    productDescription: clip(productDescription, 500),
    targetAudience: bio
      ? `People who follow @${username} and engage with ${displayName}'s Threads content.`
      : `People who follow @${username} on ${platformLabel}.`,
    toneOfVoice: postTexts.length > 0
      ? 'Matches your recent Threads captions and replies.'
      : 'Clear, friendly, and on-brand.',
    toneExamples:
      toneExamplesParts.join('\n\n') ||
      'Short hooks, direct CTAs, and authentic captions.',
    additionalContext: [
      `Primary platform: ${platformLabel}.`,
      bio ? `Profile bio: ${clip(bio, 220)}` : null,
      postTexts.length > 0 ? `Sampled ${postTexts.length} recent posts for tone.` : null,
    ]
      .filter(Boolean)
      .join(' '),
  };
}

export type FunnelAccountSnapshot = {
  accountId: string;
  platform: ChatHeroPlatformId;
  platformLabel: string;
  username: string;
  profilePicture: string | null;
  draft: BrandContextRecord;
};

export async function buildFunnelBrandDraftForAccount(
  accountId: string,
  guestUserId: string
): Promise<FunnelAccountSnapshot | null> {
  const account = await prisma.socialAccount.findFirst({
    where: { id: accountId, userId: guestUserId, status: 'connected' },
    select: {
      id: true,
      platform: true,
      username: true,
      profilePicture: true,
      accessToken: true,
      expiresAt: true,
    },
  });
  if (!account) return null;

  const platform = platformToFunnelId(account.platform);
  const platformLabel = platformLabelFromId(platform);
  let draft: BrandContextRecord;

  if (account.platform === 'THREADS') {
    try {
      draft = await buildThreadsBrandDraft(account, platformLabel);
      const token = await getValidThreadsToken(account);
      const profile = await fetchThreadsProfile(token);
      if (profile?.threads_profile_picture_url) {
        return {
          accountId: account.id,
          platform,
          platformLabel,
          username: profile.username ?? account.username,
          profilePicture: profile.threads_profile_picture_url,
          draft,
        };
      }
    } catch (e) {
      console.warn('[funnel/brand-draft] Threads build failed:', (e as Error)?.message ?? e);
      draft = defaultBrandContextDraft(platformLabel, account.username);
    }
  } else {
    draft = defaultBrandContextDraft(platformLabel, account.username);
  }

  return {
    accountId: account.id,
    platform,
    platformLabel,
    username: account.username,
    profilePicture: account.profilePicture ?? null,
    draft,
  };
}
