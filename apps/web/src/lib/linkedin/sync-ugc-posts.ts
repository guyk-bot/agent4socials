/**
 * Sync LinkedIn UGC posts into ImportedPost (personal profile or organization Page).
 * Used by GET /posts?sync=1 and by the sync engine adapter.
 */

import axios from 'axios';
import { prisma } from '@/lib/db';
import { Platform } from '@prisma/client';
import { refreshLinkedInImportedPostMetrics } from '@/lib/linkedin/sync-post-metrics';

/** Resolve authors filter URN for ugcPosts?q=authors */
export function linkedInAuthorUrnForUgc(platformUserId: string, credentialsJson?: unknown): string {
  const cred =
    credentialsJson && typeof credentialsJson === 'object'
      ? (credentialsJson as { linkedinRestPersonUrn?: string })
      : {};
  const fromRest = typeof cred.linkedinRestPersonUrn === 'string' ? cred.linkedinRestPersonUrn.trim() : '';
  if (fromRest.startsWith('urn:li:person:') || fromRest.startsWith('urn:li:organization:')) {
    return fromRest;
  }
  const id = platformUserId.trim();
  if (id.startsWith('urn:li:organization:')) return id;
  if (id.startsWith('urn:li:person:')) return id;
  return `urn:li:person:${id}`;
}

export type SyncLinkedInUgcPostsResult = {
  itemsProcessed: number;
  /** User-visible hint when sync fails or returns no data due to permissions */
  syncError?: string;
};

/**
 * Requires appropriate LinkedIn scopes (e.g. r_member_social for personal, r_organization_social for org shares).
 * See https://learn.microsoft.com/en-us/linkedin/marketing/integrations/community-management/shares/ugc-post-api
 */
export async function syncLinkedInUgcPosts(params: {
  socialAccountId: string;
  platformUserId: string;
  accessToken: string;
  credentialsJson?: unknown;
}): Promise<SyncLinkedInUgcPostsResult> {
  const { socialAccountId, platformUserId, accessToken, credentialsJson } = params;
  const authorUrn = linkedInAuthorUrnForUgc(platformUserId, credentialsJson);

  try {
    const postsRes = await axios.get<{
      elements?: Array<{
        id?: string;
        specificContent?: {
          'com.linkedin.ugc.ShareContent'?: {
            shareCommentary?: { text?: string };
            shareMediaCategory?: string;
            media?: Array<{ thumbnails?: Array<{ url?: string }> }>;
          };
        };
        firstPublishedAt?: number;
        lifecycleState?: string;
      }>;
    }>('https://api.linkedin.com/v2/ugcPosts', {
      params: {
        q: 'authors',
        authors: `List(${encodeURIComponent(authorUrn)})`,
        count: 50,
      },
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'X-Restli-Protocol-Version': '2.0.0',
      },
      timeout: 25_000,
      validateStatus: () => true,
    });

    if (postsRes.status >= 400) {
      const err = postsRes.data as { message?: string; serviceErrorCode?: number; status?: number };
      const msg =
        typeof err?.message === 'string'
          ? err.message
          : `LinkedIn API error (${postsRes.status}). Check scopes and reconnect.`;
      const lower = msg.toLowerCase();
      if (postsRes.status === 401 || postsRes.status === 403 || lower.includes('permission') || lower.includes('not authorized')) {
        return {
          itemsProcessed: 0,
          syncError:
            'LinkedIn could not load posts (permission denied). Personal profiles need the r_member_social scope (Marketing Developer Platform) in your LinkedIn app and OAuth flow, then reconnect. Organization Pages need r_organization_social (Community Management). OpenID (userinfo) alone is not enough for UGC or comments.',
        };
      }
      return { itemsProcessed: 0, syncError: msg.slice(0, 400) };
    }

    const items = postsRes.data?.elements ?? [];
    let itemsProcessed = 0;

    for (const p of items) {
      if (p.lifecycleState === 'DELETED') continue;
      const postId = p.id;
      if (!postId) continue;
      const publishedAt = p.firstPublishedAt ? new Date(p.firstPublishedAt) : new Date();
      const shareContent = p.specificContent?.['com.linkedin.ugc.ShareContent'];
      const content = shareContent?.shareCommentary?.text ?? null;
      const thumbnailUrl = shareContent?.media?.[0]?.thumbnails?.[0]?.url ?? null;
      const permalinkUrl = `https://www.linkedin.com/feed/update/${encodeURIComponent(postId)}`;
      await prisma.importedPost.upsert({
        where: {
          socialAccountId_platformPostId: { socialAccountId, platformPostId: postId },
        },
        update: {
          content,
          thumbnailUrl,
          permalinkUrl,
          publishedAt,
          mediaType: shareContent?.shareMediaCategory ?? null,
          impressions: 0,
          interactions: 0,
          syncedAt: new Date(),
        },
        create: {
          socialAccountId,
          platformPostId: postId,
          platform: Platform.LINKEDIN,
          content,
          thumbnailUrl,
          permalinkUrl,
          publishedAt,
          mediaType: shareContent?.shareMediaCategory ?? null,
          impressions: 0,
          interactions: 0,
        },
      });
      itemsProcessed++;
    }

    try {
      await refreshLinkedInImportedPostMetrics({
        id: socialAccountId,
        platformUserId,
        accessToken,
      });
    } catch {
      /* metrics are best-effort; UGC rows still exist */
    }

    return { itemsProcessed };
  } catch (e) {
    const ax = e as { response?: { status?: number; data?: { message?: string } }; message?: string };
    const msg =
      ax?.response?.data?.message ||
      ax?.message ||
      'LinkedIn post sync failed.';
    const lower = String(msg).toLowerCase();
    if (
      ax?.response?.status === 401 ||
      ax?.response?.status === 403 ||
      lower.includes('401') ||
      lower.includes('403') ||
      lower.includes('permission')
    ) {
      return {
        itemsProcessed: 0,
        syncError:
          'Reconnect your LinkedIn account. Post sync needs the correct LinkedIn API product and scopes (member or organization social read, depending on profile vs Page).',
      };
    }
    return { itemsProcessed: 0, syncError: String(msg).slice(0, 400) };
  }
}
