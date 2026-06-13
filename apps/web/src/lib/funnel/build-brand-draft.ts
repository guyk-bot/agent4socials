import type { Platform } from '@prisma/client';
import type { BrandContextRecord } from '@/lib/brand-context-utils';
import { prisma } from '@/lib/db';
import { emptyBrandContextDraft, platformLabelFromId } from '@/lib/funnel-chat-flow';
import type { ChatHeroPlatformId } from '@/lib/chat-hero-script';
import { fetchThreadsProfile, threadsGet } from '@/lib/threads/threads-api';
import { getValidThreadsToken } from '@/lib/threads/threads-token';
import { synthesizeThreadsBrandContext } from '@/lib/funnel/synthesize-threads-brand';

export type BrandContextSource = 'profile' | 'manual';

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

async function buildThreadsBrandDraft(
  account: { id: string; accessToken: string; expiresAt: Date | null; username: string }
): Promise<{ draft: BrandContextRecord; source: BrandContextSource; hashtagPool: string[]; hasUsableDraft: boolean }> {
  const token = await getValidThreadsToken(account);
  const profile = await fetchThreadsProfile(token);
  const bio = profile?.threads_biography?.trim() ?? '';

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
  for (const row of postRows.slice(0, 4)) {
    if (!row.id || replyTexts.length >= 8) break;
    const replies = await threadsGet<{ data?: { text?: string; username?: string }[] }>(
      `${row.id}/replies`,
      token,
      { fields: 'text,username', limit: 8 }
    );
    if (replies.status === 200 && Array.isArray(replies.data?.data)) {
      for (const reply of replies.data.data) {
        if (reply.text?.trim()) {
          replyTexts.push(reply.text.trim());
        }
      }
    }
  }

  const synthesized = synthesizeThreadsBrandContext({ bio, postTexts, replyTexts });
  return {
    draft: synthesized.draft,
    hashtagPool: synthesized.hashtagPool,
    source: synthesized.hasUsableDraft ? 'profile' : 'manual',
    hasUsableDraft: synthesized.hasUsableDraft,
  };
}

/** Build brand context draft from a connected Threads account (bio, posts, replies). */
export async function buildThreadsBrandDraftForAccount(account: {
  id: string;
  accessToken: string;
  expiresAt: Date | null;
  username: string;
}) {
  return buildThreadsBrandDraft(account);
}

export type FunnelAccountSnapshot = {
  accountId: string;
  platform: ChatHeroPlatformId;
  platformLabel: string;
  username: string;
  profilePicture: string | null;
  draft: BrandContextRecord;
  brandContextSource: BrandContextSource;
  hashtagPool: string[];
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
  let draft: BrandContextRecord = emptyBrandContextDraft();
  let brandContextSource: BrandContextSource = 'manual';
  let hashtagPool: string[] = [];
  let username = account.username;
  let profilePicture = account.profilePicture ?? null;

  if (account.platform === 'THREADS') {
    try {
      const token = await getValidThreadsToken(account);
      const profile = await fetchThreadsProfile(token);
      if (profile?.username) username = profile.username;
      if (profile?.threads_profile_picture_url) {
        profilePicture = profile.threads_profile_picture_url;
        await prisma.socialAccount
          .update({
            where: { id: account.id },
            data: { profilePicture, username: profile.username ?? account.username },
          })
          .catch(() => {});
      }
      const built = await buildThreadsBrandDraft(account);
      draft = built.draft;
      brandContextSource = built.source;
      hashtagPool = built.hashtagPool;
    } catch (e) {
      console.warn('[funnel/brand-draft] Threads build failed:', (e as Error)?.message ?? e);
      draft = emptyBrandContextDraft();
      brandContextSource = 'manual';
    }
  }

  return {
    accountId: account.id,
    platform,
    platformLabel,
    username,
    profilePicture,
    draft,
    brandContextSource,
    hashtagPool,
  };
}
