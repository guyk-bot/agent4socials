import type { Platform } from '@prisma/client';
import type { BrandContextRecord } from '@/lib/brand-context-utils';
import { prisma } from '@/lib/db';
import { emptyBrandContextDraft, platformLabelFromId } from '@/lib/funnel-chat-flow';
import type { ChatHeroPlatformId } from '@/lib/chat-hero-script';
import { fetchThreadsProfile, threadsGet } from '@/lib/threads/threads-api';
import { getValidThreadsToken } from '@/lib/threads/threads-token';

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

function substantivePosts(texts: string[], minLen = 20): string[] {
  return texts.filter((t) => t.replace(/\s+/g, ' ').trim().length >= minLen);
}

function inferToneFromPosts(postTexts: string[]): string {
  const joined = postTexts.join(' ').toLowerCase();
  const traits: string[] = [];
  if (/[!]{1,}/.test(joined) || /\b(excited|launch|soon|new|free)\b/.test(joined)) {
    traits.push('energetic and promotional');
  }
  if (/\?/.test(joined)) traits.push('conversational');
  if (/\b(you|your|we|our)\b/.test(joined)) traits.push('direct and personal');
  if (traits.length === 0) return 'Authentic and consistent with your recent Threads captions.';
  return `${traits.slice(0, 2).join(', ')} — based on your recent Threads posts.`;
}

function inferTargetAudience(
  username: string,
  displayName: string,
  bio: string,
  postTexts: string[]
): string {
  const bioLower = bio.toLowerCase();
  if (/\b(creator|creators|business|businesses|founder|coach|agency|brand)\b/.test(bioLower)) {
    return clip(
      `Creators and businesses who follow @${username} and align with ${displayName}'s focus.`,
      280
    );
  }
  const lead = substantivePosts(postTexts, 30)[0];
  if (lead) {
    return clip(
      `People on Threads who engage with @${username} — especially those interested in topics like: "${clip(lead, 90)}"`,
      320
    );
  }
  if (bio) {
    return clip(`Followers of @${username} who resonate with: ${clip(bio, 160)}`, 320);
  }
  return '';
}

async function buildThreadsBrandDraft(
  account: { id: string; accessToken: string; expiresAt: Date | null; username: string },
  platformLabel: string
): Promise<{ draft: BrandContextRecord; source: BrandContextSource }> {
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
  for (const row of postRows.slice(0, 3)) {
    if (!row.id || replyTexts.length >= 5) break;
    const replies = await threadsGet<{ data?: { text?: string; username?: string }[] }>(
      `${row.id}/replies`,
      token,
      { fields: 'text,username', limit: 6 }
    );
    if (replies.status === 200 && Array.isArray(replies.data?.data)) {
      for (const reply of replies.data.data) {
        if (reply.text?.trim()) {
          replyTexts.push(
            reply.username ? `@${reply.username}: ${reply.text.trim()}` : reply.text.trim()
          );
        }
      }
    }
  }

  const substantive = substantivePosts(postTexts, 25);
  const hasBio = bio.length >= 20;
  const hasPosts = substantive.length >= 1;
  const hasRichData = hasBio || substantive.length >= 2 || (hasPosts && substantive[0].length >= 40);

  if (!hasRichData) {
    const toneExamples =
      postTexts.length > 0 ? joinSamples(postTexts, 3, 140) : '';
    return {
      source: 'manual',
      draft: {
        ...emptyBrandContextDraft(),
        productDescription: bio ? clip(bio, 400) : '',
        toneExamples,
      },
    };
  }

  const bestPost = [...substantive].sort((a, b) => b.length - a.length)[0] ?? '';
  const productDescription = hasBio
    ? clip(bio, 500)
    : bestPost
      ? clip(bestPost, 480)
      : clip(substantive[0] ?? '', 480);

  const targetAudience = inferTargetAudience(username, displayName, bio, postTexts);

  const toneExamplesParts: string[] = [];
  if (postTexts.length > 0) {
    toneExamplesParts.push(`Recent posts:\n${joinSamples(postTexts, 4, 160)}`);
  }
  if (replyTexts.length > 0) {
    toneExamplesParts.push(`Recent replies on your posts:\n${joinSamples(replyTexts, 3, 120)}`);
  }

  return {
    source: 'profile',
    draft: {
      productDescription,
      targetAudience: targetAudience || `People who follow @${username} on ${platformLabel}.`,
      toneOfVoice: postTexts.length > 0 ? inferToneFromPosts(postTexts) : 'Clear, friendly, and on-brand.',
      toneExamples:
        toneExamplesParts.join('\n\n') ||
        joinSamples(postTexts, 3, 140) ||
        'Short hooks, direct CTAs, and authentic captions.',
      additionalContext: [
        `Primary platform: ${platformLabel}.`,
        bio ? `Profile bio: ${clip(bio, 220)}` : null,
        postTexts.length > 0 ? `Sampled ${postTexts.length} recent posts for tone.` : null,
        replyTexts.length > 0 ? `Included ${replyTexts.length} recent replies.` : null,
      ]
        .filter(Boolean)
        .join(' '),
    },
  };
}

export type FunnelAccountSnapshot = {
  accountId: string;
  platform: ChatHeroPlatformId;
  platformLabel: string;
  username: string;
  profilePicture: string | null;
  draft: BrandContextRecord;
  brandContextSource: BrandContextSource;
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
  let brandContextSource: BrandContextSource = 'manual';
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
      const built = await buildThreadsBrandDraft(account, platformLabel);
      draft = built.draft;
      brandContextSource = built.source;
    } catch (e) {
      console.warn('[funnel/brand-draft] Threads build failed:', (e as Error)?.message ?? e);
      draft = emptyBrandContextDraft();
      brandContextSource = 'manual';
    }
  } else {
    draft = emptyBrandContextDraft();
    brandContextSource = 'manual';
  }

  return {
    accountId: account.id,
    platform,
    platformLabel,
    username,
    profilePicture,
    draft,
    brandContextSource,
  };
}
