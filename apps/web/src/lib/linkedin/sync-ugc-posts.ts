/**
 * Sync LinkedIn UGC posts into ImportedPost (personal profile or organization Page).
 * Used by GET /posts?sync=1 and by the sync engine adapter.
 */

import axios from 'axios';
import { prisma } from '@/lib/db';
import { Platform } from '@prisma/client';
import { refreshLinkedInImportedPostMetrics } from '@/lib/linkedin/sync-post-metrics';
import { buildLinkedInRestPostsByAuthorUrl, linkedInRestCommunityHeaders } from '@/lib/linkedin/rest-config';

/** Resolve author URN for GET /rest/posts?q=author&author=… */
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

/** Parse one element from GET https://api.linkedin.com/rest/posts?q=author (also used by comments live sources). */
export function parseLinkedInRestPostElement(p: unknown): {
  id: string;
  content: string | null;
  thumbnailUrl: string | null;
  publishedAt: Date;
  mediaType: string | null;
  lifecycleState: string | null;
} | null {
  if (!p || typeof p !== 'object') return null;
  const row = p as Record<string, unknown>;
  const id = typeof row.id === 'string' ? row.id.trim() : '';
  if (!id) return null;

  let content: string | null = null;
  const commentary = row.commentary;
  if (typeof commentary === 'string') content = commentary.trim() || null;
  else if (commentary && typeof commentary === 'object') {
    const c = commentary as Record<string, unknown>;
    if (typeof c.text === 'string') content = c.text.trim() || null;
  }
  if (!content) {
    const sc = row.specificContent as Record<string, unknown> | undefined;
    const ugc = sc?.['com.linkedin.ugc.ShareContent'] as Record<string, unknown> | undefined;
    const t = ugc?.shareCommentary as { text?: string } | undefined;
    if (typeof t?.text === 'string') content = t.text.trim() || null;
  }

  let publishedAt = new Date();
  for (const k of ['publishedAt', 'createdAt', 'lastModifiedAt', 'firstPublishedAt'] as const) {
    const v = row[k];
    if (typeof v === 'number' && Number.isFinite(v)) {
      publishedAt = new Date(v);
      break;
    }
    if (typeof v === 'string' && /^\d+$/.test(v)) {
      publishedAt = new Date(Number(v));
      break;
    }
  }

  let thumbnailUrl: string | null = null;
  const sc = row.specificContent as Record<string, unknown> | undefined;
  const ugc = sc?.['com.linkedin.ugc.ShareContent'] as Record<string, unknown> | undefined;
  const media = ugc?.media as Array<{ thumbnails?: Array<{ url?: string }> }> | undefined;
  const u = media?.[0]?.thumbnails?.[0]?.url;
  if (typeof u === 'string' && u.trim()) thumbnailUrl = u.trim();

  const shareContent = ugc;
  const mediaType =
    typeof shareContent?.shareMediaCategory === 'string' ? shareContent.shareMediaCategory : null;

  const lifecycleState = typeof row.lifecycleState === 'string' ? row.lifecycleState : null;
  return { id, content, thumbnailUrl, publishedAt, mediaType, lifecycleState };
}

/**
 * Requires appropriate LinkedIn scopes (e.g. r_member_social for personal, r_organization_social for org shares).
 * Lists posts via Community Management GET /rest/posts (not legacy v2/ugcPosts).
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
    const postsUrl = buildLinkedInRestPostsByAuthorUrl(authorUrn, 50);
    const postsRes = await axios.get<{ elements?: unknown[] }>(postsUrl, {
      headers: linkedInRestCommunityHeaders(accessToken),
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
            'LinkedIn could not load posts (permission denied). Personal profiles need the r_member_social scope (Marketing Developer Platform) in your LinkedIn app and OAuth flow, then reconnect. Organization Pages need r_organization_social (Community Management). OpenID (userinfo) alone is not enough for posts or comments.',
        };
      }
      return { itemsProcessed: 0, syncError: msg.slice(0, 400) };
    }

    const items = postsRes.data?.elements ?? [];
    let itemsProcessed = 0;

    for (const raw of items) {
      const parsed = parseLinkedInRestPostElement(raw);
      if (!parsed || parsed.lifecycleState === 'DELETED') continue;
      const { id: postId, content, thumbnailUrl, publishedAt, mediaType } = parsed;
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
          mediaType,
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
          mediaType,
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
