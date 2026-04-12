/**
 * LinkedIn Marketing / Community Management API client (official REST + OpenID).
 *
 * Headers on every outbound call (per LinkedIn versioning rules):
 * - Authorization: Bearer <token>
 * - LinkedIn-Version: YYYYMM (from LINKEDIN_REST_API_VERSION or default in rest-config)
 * - X-Restli-Protocol-Version: 2.0.0
 *
 * Flow:
 * 1) GET https://api.linkedin.com/v2/userinfo — resolve member `sub` → person URN
 * 2) GET https://api.linkedin.com/rest/posts?author=urn:li:person:{id}&q=author&count=…
 * 3) GET https://api.linkedin.com/rest/memberCreatorPostAnalytics — per-post totals
 */

import axios, { type AxiosResponse } from 'axios';
import { getLinkedInRestApiVersion, linkedInRestCommunityHeaders } from '@/lib/linkedin/rest-config';
import { normalizeLinkedInPostUrn } from '@/lib/linkedin/sync-post-metrics';

/** Thrown when the member token is expired/revoked so the auth layer can trigger re-auth / email. */
export class LinkedInTokenExpiredError extends Error {
  readonly code = 'LINKEDIN_TOKEN_EXPIRED' as const;

  constructor(message = 'LinkedIn access token is expired or invalid. Reconnect the account.') {
    super(message);
    this.name = 'LinkedInTokenExpiredError';
    Object.setPrototypeOf(this, LinkedInTokenExpiredError.prototype);
  }
}

export class LinkedInRateLimitedError extends Error {
  readonly code = 'LINKEDIN_RATE_LIMITED' as const;

  constructor(
    message = 'LinkedIn API rate limit exceeded.',
    readonly retryAfterMs?: number
  ) {
    super(message);
    this.name = 'LinkedInRateLimitedError';
    Object.setPrototypeOf(this, LinkedInRateLimitedError.prototype);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function isTokenAuthFailure(status: number, body: unknown): boolean {
  if (status === 401) return true;
  if (status !== 403) return false;
  const msg = JSON.stringify(body ?? '').toLowerCase();
  return (
    msg.includes('not enough permissions') ||
    msg.includes('invalid') ||
    msg.includes('expired') ||
    msg.includes('revoked')
  );
}

/** RestLI `entity` finder value for memberCreatorPostAnalytics. */
function memberCreatorEntityParam(postUrn: string): string {
  const urn = normalizeLinkedInPostUrn(postUrn);
  if (urn.startsWith('urn:li:share:')) return `(share:${encodeURIComponent(urn)})`;
  return `(ugc:${encodeURIComponent(urn)})`;
}

type MemberAnalyticsQueryType =
  | 'IMPRESSION'
  | 'REACTION'
  | 'COMMENT'
  | 'RESHARE'
  | 'CLICK'
  | 'VIDEO_WATCH_TIME';

async function linkedInRequestJson<T>(
  method: 'GET' | 'POST',
  url: string,
  accessToken: string,
  options?: { maxRetries?: number }
): Promise<AxiosResponse<T>> {
  const headers = linkedInRestCommunityHeaders(accessToken);
  const maxRetries = options?.maxRetries ?? 3;
  let attempt = 0;

  while (true) {
    const r = await axios.request<T>({
      method,
      url,
      headers,
      timeout: 25_000,
      validateStatus: () => true,
    });

    if (r.status === 429) {
      const raRaw = r.headers['retry-after'] ?? r.headers['Retry-After'];
      const raSec = typeof raRaw === 'string' ? Number.parseInt(raRaw, 10) : Number(raRaw);
      const backoffMs =
        Number.isFinite(raSec) && raSec > 0 ? Math.min(raSec * 1000, 60_000) : Math.min(2000 * 2 ** attempt, 30_000);
      if (attempt >= maxRetries) {
        throw new LinkedInRateLimitedError('LinkedIn returned 429 too many times.', backoffMs);
      }
      attempt += 1;
      await sleep(backoffMs);
      continue;
    }

    if (isTokenAuthFailure(r.status, r.data)) {
      const detail =
        typeof (r.data as { message?: string })?.message === 'string'
          ? (r.data as { message: string }).message
          : `HTTP ${r.status}`;
      throw new LinkedInTokenExpiredError(`LinkedIn auth failed: ${detail}`);
    }

    return r;
  }
}

/** OpenID Connect userinfo (step 1). */
export type LinkedInOpenIdUserInfo = {
  sub: string;
  name?: string;
  given_name?: string;
  family_name?: string;
  email?: string;
  picture?: string;
  locale?: string;
};

export function personUrnFromOpenIdSub(sub: string): string {
  const s = sub.trim();
  if (!s) throw new LinkedInTokenExpiredError('LinkedIn userinfo returned an empty subject (sub).');
  if (s.startsWith('urn:li:person:')) return s;
  return `urn:li:person:${s}`;
}

export type LinkedInRestPostElement = {
  id?: string;
  author?: string | { id?: string };
  commentary?: string;
  lifecycleState?: string;
  createdAt?: number | string;
  lastModifiedAt?: number | string;
};

export type LinkedInRestPostsResponse = {
  elements?: LinkedInRestPostElement[];
  paging?: { start?: number; count?: number; total?: number };
};

export type LinkedInPostEngagement = {
  postUrn: string;
  impressions: number;
  clicks: number;
  comments: number;
  shares: number;
  videoWatchTimeMs: number | null;
};

/**
 * Typed facade over LinkedIn `/v2/userinfo`, `/rest/posts`, and `/rest/memberCreatorPostAnalytics`.
 */
export class LinkedInApiClient {
  constructor(private readonly accessToken: string) {}

  get linkedInVersion(): string {
    return getLinkedInRestApiVersion();
  }

  /** Step 1 — GET https://api.linkedin.com/v2/userinfo */
  async fetchOpenIdUserInfo(): Promise<LinkedInOpenIdUserInfo> {
    const url = 'https://api.linkedin.com/v2/userinfo';
    const r = await linkedInRequestJson<LinkedInOpenIdUserInfo>('GET', url, this.accessToken);
    if (r.status < 200 || r.status >= 300) {
      throw new Error(`LinkedIn userinfo failed: HTTP ${r.status}`);
    }
    if (!r.data?.sub) {
      throw new LinkedInTokenExpiredError('LinkedIn userinfo response missing `sub`.');
    }
    return r.data;
  }

  /**
   * Step 2 — GET https://api.linkedin.com/rest/posts?author=urn:li:person:{person_id}&q=author&count=…
   * `authorUrn` must be the full person URN (e.g. urn:li:person:abc123).
   */
  async fetchRecentOrganicPosts(authorUrn: string, count = 10): Promise<LinkedInRestPostsResponse> {
    const params = new URLSearchParams();
    params.set('author', authorUrn);
    params.set('q', 'author');
    params.set('count', String(Math.min(100, Math.max(1, count))));
    const url = `https://api.linkedin.com/rest/posts?${params.toString()}`;
    const r = await linkedInRequestJson<LinkedInRestPostsResponse>('GET', url, this.accessToken);
    if (r.status < 200 || r.status >= 300) {
      const msg =
        typeof (r.data as { message?: string })?.message === 'string'
          ? (r.data as { message: string }).message
          : `HTTP ${r.status}`;
      throw new Error(`LinkedIn Posts API failed: ${msg}`);
    }
    return r.data ?? {};
  }

  /**
   * Step 3 — Member post analytics totals for one post URN (ugcPost or share).
   * Uses GET https://api.linkedin.com/rest/memberCreatorPostAnalytics?q=entity&entity=…&queryType=…&aggregation=TOTAL
   */
  async fetchMemberPostEngagement(postUrn: string): Promise<LinkedInPostEngagement> {
    const entity = memberCreatorEntityParam(postUrn);
    const types: MemberAnalyticsQueryType[] = [
      'IMPRESSION',
      'REACTION',
      'COMMENT',
      'RESHARE',
      'CLICK',
      'VIDEO_WATCH_TIME',
    ];
    const counts: Partial<Record<MemberAnalyticsQueryType, number>> = {};

    for (const queryType of types) {
      const url =
        `https://api.linkedin.com/rest/memberCreatorPostAnalytics?q=entity` +
        `&entity=${entity}&queryType=${queryType}&aggregation=TOTAL`;
      const r = await linkedInRequestJson<{ elements?: Array<{ count?: number }> }>('GET', url, this.accessToken);
      if (r.status < 200 || r.status >= 300) {
        counts[queryType] = 0;
        continue;
      }
      const els = r.data?.elements ?? [];
      counts[queryType] = els.reduce(
        (s, e) => s + (typeof e.count === 'number' && Number.isFinite(e.count) ? e.count : 0),
        0
      );
    }

    const impressions = counts.IMPRESSION ?? 0;
    const clicks = counts.CLICK ?? 0;
    const comments = counts.COMMENT ?? 0;
    const shares = counts.RESHARE ?? 0;
    const videoWatchTimeMsRaw = counts.VIDEO_WATCH_TIME ?? null;
    const videoWatchTimeMs =
      typeof videoWatchTimeMsRaw === 'number' && Number.isFinite(videoWatchTimeMsRaw)
        ? Math.round(videoWatchTimeMsRaw)
        : null;

    return {
      postUrn: normalizeLinkedInPostUrn(postUrn),
      impressions,
      clicks,
      comments,
      shares,
      videoWatchTimeMs,
    };
  }

  /** Convenience: userinfo → person URN string for Posts `author` param. */
  async resolvePersonUrnFromUserInfo(): Promise<string> {
    const u = await this.fetchOpenIdUserInfo();
    return personUrnFromOpenIdSub(u.sub);
  }
}
