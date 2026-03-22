import axios from 'axios';
import { prisma } from '@/lib/db';
import { fbRestBaseUrl } from './constants';
import { fetchPageProfile, reviewContentHash } from './fetchers';

export type FacebookAuxSyncReport = {
  pageProfileCached: boolean;
  conversationsPages: number;
  conversationsUpserted: number;
  reviewsPages: number;
  reviewsUpserted: number;
  errors: string[];
};

/**
 * Persists Page profile, paginated conversations, and ratings into normalized cache tables.
 * Does not call `/{page-id}/notifications` (not a valid Page field per live Graph).
 */
export async function syncFacebookAuxiliaryIngest(params: {
  socialAccountId: string;
  pageId: string;
  accessToken: string;
}): Promise<FacebookAuxSyncReport> {
  const { socialAccountId, pageId, accessToken } = params;
  const errors: string[] = [];
  let pageProfileCached = false;

  try {
    const prof = await fetchPageProfile(pageId, accessToken);
    if (prof.status === 200 && prof.data?.id) {
      await prisma.facebookPageCache.upsert({
        where: { socialAccountId },
        create: { socialAccountId, pageId, profileJson: prof.data as object },
        update: { pageId, profileJson: prof.data as object, fetchedAt: new Date() },
      });
      pageProfileCached = true;
    } else {
      errors.push('page_profile_failed');
    }
  } catch {
    errors.push('page_profile_exception');
  }

  let conversationsPages = 0;
  let conversationsUpserted = 0;
  try {
    let after: string | undefined;
    while (conversationsPages < 40) {
      conversationsPages += 1;
      const p: Record<string, string> = {
        platform: 'MESSENGER',
        access_token: accessToken,
        limit: '50',
        fields: 'id,link,updated_time',
      };
      if (after) p.after = after;
      const res = await axios.get(`${fbRestBaseUrl}/${pageId}/conversations`, {
        params: p,
        timeout: 15_000,
        validateStatus: () => true,
      });
      if (res.status !== 200) {
        const err = (res.data as { error?: { message?: string } })?.error?.message;
        if (err) errors.push(`conversations:${err}`);
        break;
      }
      const rows = (res.data as { data?: Array<{ id?: string; link?: string; updated_time?: string }> }).data ?? [];
      for (const r of rows) {
        if (!r.id) continue;
        await prisma.facebookConversationCache.upsert({
          where: {
            socialAccountId_platformConversationId: { socialAccountId, platformConversationId: r.id },
          },
          create: {
            socialAccountId,
            platformConversationId: r.id,
            link: r.link ?? null,
            updatedTime: r.updated_time ? new Date(r.updated_time) : null,
          },
          update: {
            link: r.link ?? null,
            updatedTime: r.updated_time ? new Date(r.updated_time) : null,
            fetchedAt: new Date(),
          },
        });
        conversationsUpserted += 1;
      }
      const nextAfter = (res.data as { paging?: { cursors?: { after?: string } } }).paging?.cursors?.after;
      if (!nextAfter || rows.length === 0) break;
      after = nextAfter;
    }
  } catch {
    errors.push('conversations_exception');
  }

  let reviewsPages = 0;
  let reviewsUpserted = 0;
  try {
    const fields = 'created_time,recommendation_type,review_text,rating';
    let after: string | undefined;
    while (reviewsPages < 40) {
      reviewsPages += 1;
      const p: Record<string, string> = { fields, access_token: accessToken, limit: '50' };
      if (after) p.after = after;
      const res = await axios.get(`${fbRestBaseUrl}/${pageId}/ratings`, {
        params: p,
        timeout: 15_000,
        validateStatus: () => true,
      });
      if (res.status !== 200) {
        const err = (res.data as { error?: { message?: string } })?.error?.message;
        if (err) errors.push(`ratings:${err}`);
        break;
      }
      const rows = (res.data as {
        data?: Array<{ created_time?: string; recommendation_type?: string; review_text?: string }>;
      }).data ?? [];
      for (const r of rows) {
        const created = r.created_time ? new Date(r.created_time) : new Date();
        const hash = reviewContentHash(r.created_time ?? null, r.review_text ?? null);
        await prisma.facebookReviewCache.upsert({
          where: { socialAccountId_contentHash: { socialAccountId, contentHash: hash } },
          create: {
            socialAccountId,
            sourceCreatedAt: created,
            recommendationType: r.recommendation_type ?? null,
            reviewText: r.review_text ?? null,
            contentHash: hash,
          },
          update: {
            recommendationType: r.recommendation_type ?? null,
            reviewText: r.review_text ?? null,
            fetchedAt: new Date(),
          },
        });
        reviewsUpserted += 1;
      }
      const nextAfter = (res.data as { paging?: { cursors?: { after?: string } } }).paging?.cursors?.after;
      if (!nextAfter || rows.length === 0) break;
      after = nextAfter;
    }
  } catch {
    errors.push('reviews_exception');
  }

  return {
    pageProfileCached,
    conversationsPages,
    conversationsUpserted,
    reviewsPages,
    reviewsUpserted,
    errors,
  };
}
