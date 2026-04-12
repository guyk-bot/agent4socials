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
import {
  buildLinkedInRestPostsByAuthorUrl,
  getLinkedInRestApiVersion,
  linkedInRestCommunityHeaders,
} from '@/lib/linkedin/rest-config';
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
  // Narrow: generic "not enough permissions" is often a missing product scope, not clock expiry.
  return (
    msg.includes('invalid_token') ||
    msg.includes('invalid access token') ||
    msg.includes('expired') ||
    msg.includes('revoked')
  );
}

/**
 * Canonical post URN for memberCreatorPostAnalytics `entity` finder.
 * Microsoft Learn: entity must be ugcPost or share — `(ugc:urn%3Ali%3AugcPost%3A…)` or `(share:urn%3Ali%3Ashare%3A…)`.
 * Do NOT prefix arbitrary IDs as ugcPost when the API already returned a full URN (e.g. urn:li:post:… in future).
 */
export function canonicalPostUrnForMemberAnalytics(postUrn: string): string {
  const u = postUrn.trim();
  if (u.startsWith('urn:li:share:') || u.startsWith('urn:li:ugcPost:')) return u;
  if (/^\d+$/.test(u)) return `urn:li:ugcPost:${u}`;
  return normalizeLinkedInPostUrn(u);
}

/**
 * RestLI `entity` query value: literal `(ugc:ENCODED_URN)` / `(share:ENCODED_URN)` where ENCODED_URN is
 * `encodeURIComponent(urn)` per Microsoft samples (colons → %3A, etc.).
 * The parentheses stay literal in the query string as in LinkedIn’s documented URLs.
 */
export function memberCreatorAnalyticsEntityQueryValue(postUrn: string): string {
  const urn = canonicalPostUrnForMemberAnalytics(postUrn);
  const encodedUrn = encodeURIComponent(urn);
  if (urn.startsWith('urn:li:share:')) return `(share:${encodedUrn})`;
  return `(ugc:${encodedUrn})`;
}

/** Official memberCreatorPostAnalytics queryType values (2026-03 docs). */
type MemberAnalyticsQueryType = 'IMPRESSION' | 'MEMBERS_REACHED' | 'RESHARE' | 'REACTION' | 'COMMENT';

function safeJsonForLog(value: unknown, maxLen = 16_000): string {
  try {
    const s = JSON.stringify(value, null, 0);
    return s.length > maxLen ? `${s.slice(0, maxLen)}…[truncated]` : s;
  } catch {
    return String(value);
  }
}

function sumAnalyticsElementCounts(data: { elements?: unknown[] } | null | undefined): number {
  const els = data?.elements;
  if (!Array.isArray(els)) return 0;
  let sum = 0;
  for (const el of els) {
    if (!el || typeof el !== 'object') continue;
    const row = el as Record<string, unknown>;
    const c = row.count;
    if (typeof c === 'number' && Number.isFinite(c)) sum += c;
    else if (typeof c === 'string' && /^\d+$/.test(c)) sum += Number.parseInt(c, 10);
  }
  return sum;
}

function analyticsErrorMessage(status: number, body: unknown): string {
  const b = body as { message?: string; error?: string; status?: number } | null;
  const parts = [
    typeof b?.message === 'string' ? b.message : null,
    typeof b?.error === 'string' ? b.error : null,
    typeof b?.status === 'number' ? `serviceStatus=${b.status}` : null,
  ].filter(Boolean);
  return parts.length ? parts.join(' | ') : `HTTP ${status}`;
}

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
  /** Not exposed on memberCreatorPostAnalytics in current LinkedIn docs; kept for schema/UI compatibility. */
  clicks: number;
  comments: number;
  shares: number;
  /** Not exposed on memberCreatorPostAnalytics for posts; reserved for future metrics. */
  videoWatchTimeMs: number | null;
  membersReached: number;
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
    const url = buildLinkedInRestPostsByAuthorUrl(authorUrn, count);
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
   * GET https://api.linkedin.com/rest/memberCreatorPostAnalytics?q=entity&entity=(ugc:…|share:…)&queryType=…&aggregation=TOTAL
   *
   * Query types per Microsoft Learn (2026-03): IMPRESSION, MEMBERS_REACHED, RESHARE, REACTION, COMMENT only.
   * Logs each request URL and raw JSON for Vercel debugging.
   */
  async fetchMemberPostEngagement(postUrn: string): Promise<LinkedInPostEngagement> {
    const canonical = canonicalPostUrnForMemberAnalytics(postUrn);
    const entity = memberCreatorAnalyticsEntityQueryValue(postUrn);
    const types: MemberAnalyticsQueryType[] = [
      'IMPRESSION',
      'MEMBERS_REACHED',
      'REACTION',
      'COMMENT',
      'RESHARE',
    ];
    const counts: Partial<Record<MemberAnalyticsQueryType, number>> = {};

    for (const queryType of types) {
      const url =
        `https://api.linkedin.com/rest/memberCreatorPostAnalytics?q=entity` +
        `&entity=${entity}&queryType=${queryType}&aggregation=TOTAL`;

      console.log(`[LinkedIn Analytics] Exact URL: ${url}`);

      const r = await linkedInRequestJson<{ elements?: unknown[] }>('GET', url, this.accessToken);

      console.log(`[LinkedIn Analytics] Raw JSON (status ${r.status}): ${safeJsonForLog(r.data)}`);

      if (isTokenAuthFailure(r.status, r.data)) {
        const msg = analyticsErrorMessage(r.status, r.data);
        console.error(`LinkedIn Analytics Error: [${r.status}] ${msg}`);
        throw new LinkedInTokenExpiredError(`LinkedIn member analytics auth failed: ${msg}`);
      }

      if (r.status < 200 || r.status >= 300) {
        const msg = analyticsErrorMessage(r.status, r.data);
        console.error(`LinkedIn Analytics Error: [${r.status}] ${msg}`);
        counts[queryType] = 0;
        continue;
      }

      counts[queryType] = sumAnalyticsElementCounts(r.data);
    }

    const imp = counts.IMPRESSION ?? 0;
    const reached = counts.MEMBERS_REACHED ?? 0;
    const impressions = Math.max(imp, reached);
    const comments = counts.COMMENT ?? 0;
    const shares = counts.RESHARE ?? 0;

    console.log(
      `[LinkedIn Analytics] Parsed totals for ${canonical}: impressions=${impressions} (IMPRESSION=${imp}, MEMBERS_REACHED=${reached}), reactions=${counts.REACTION ?? 0}, comments=${comments}, shares=${shares}`
    );

    return {
      postUrn: canonical,
      impressions,
      clicks: 0,
      comments,
      shares,
      videoWatchTimeMs: null,
      membersReached: reached,
    };
  }

  /** Convenience: userinfo → person URN string for Posts `author` param. */
  async resolvePersonUrnFromUserInfo(): Promise<string> {
    const u = await this.fetchOpenIdUserInfo();
    return personUrnFromOpenIdSub(u.sub);
  }
}
