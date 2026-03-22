import axios from 'axios';
import { FacebookMetricProbeStatus } from '@prisma/client';
import { prisma } from '@/lib/db';
import { metaGraphInsightsBaseUrl, META_GRAPH_INSIGHTS_VERSION } from '@/lib/meta-graph-insights';
import { FACEBOOK_METRIC_DISCOVERY_TTL_MS } from './constants';
import { FACEBOOK_PAGE_DAY_METRIC_CANDIDATES, FACEBOOK_POST_LIFETIME_METRIC_CANDIDATES } from './metric-candidates';

export const PAGE_INSIGHTS_DAY_SCOPE = 'page_insights:day';
export const POST_INSIGHTS_LIFETIME_SCOPE = 'post_insights:lifetime';

function classifyProbeError(code?: number, message?: string): FacebookMetricProbeStatus {
  const m = message ?? '';
  if (code === 190 || code === 102 || code === 10) return FacebookMetricProbeStatus.UNAVAILABLE;
  if (code === 100 && m.toLowerCase().includes('insights metric')) return FacebookMetricProbeStatus.INVALID;
  if (code && code >= 400) return FacebookMetricProbeStatus.UNAVAILABLE;
  return FacebookMetricProbeStatus.INVALID;
}

/** Drop cached probes from a different Graph insights version so we re-probe after upgrades. */
export async function invalidateStaleFacebookDiscovery(socialAccountId: string): Promise<void> {
  await prisma.facebookMetricDiscovery.deleteMany({
    where: {
      socialAccountId,
      graphVersion: { not: META_GRAPH_INSIGHTS_VERSION },
    },
  });
}

async function upsertProbe(params: {
  socialAccountId: string;
  pageId: string;
  scope: string;
  metricName: string;
  status: FacebookMetricProbeStatus;
  lastError: string | null;
}) {
  const { socialAccountId, pageId, scope, metricName, status, lastError } = params;
  await prisma.facebookMetricDiscovery.upsert({
    where: {
      socialAccountId_scope_metricName: { socialAccountId, scope, metricName },
    },
    create: {
      socialAccountId,
      pageId,
      scope,
      metricName,
      status,
      lastError,
      graphVersion: META_GRAPH_INSIGHTS_VERSION,
      validatedAt: new Date(),
    },
    update: {
      pageId,
      status,
      lastError,
      graphVersion: META_GRAPH_INSIGHTS_VERSION,
      validatedAt: new Date(),
    },
  });
}

export async function probePageDayMetric(
  pageId: string,
  accessToken: string,
  metric: string,
  since: string,
  until: string
): Promise<{ ok: boolean; error?: string; code?: number }> {
  try {
    const res = await axios.get(`${metaGraphInsightsBaseUrl}/${pageId}/insights`, {
      params: { metric, period: 'day', since, until, access_token: accessToken },
      timeout: 14_000,
      validateStatus: () => true,
    });
    if (res.status !== 200) {
      return { ok: false, error: `HTTP ${res.status}`, code: res.status };
    }
    const err = res.data?.error as { message?: string; code?: number } | undefined;
    if (err) {
      return { ok: false, error: err.message ?? JSON.stringify(err), code: err.code };
    }
    if (!Array.isArray(res.data?.data)) {
      return { ok: false, error: 'Missing data array', code: undefined };
    }
    return { ok: true };
  } catch (e) {
    const ax = e as { response?: { status?: number; data?: { error?: { message?: string; code?: number } } } };
    const msg = ax.response?.data?.error?.message ?? (e as Error).message;
    const code = ax.response?.data?.error?.code ?? ax.response?.status;
    return { ok: false, error: msg, code };
  }
}

export async function probePostLifetimeMetric(
  postId: string,
  accessToken: string,
  metric: string
): Promise<{ ok: boolean; error?: string; code?: number }> {
  try {
    const res = await axios.get(`${metaGraphInsightsBaseUrl}/${postId}/insights`, {
      params: { metric, access_token: accessToken },
      timeout: 14_000,
      validateStatus: () => true,
    });
    if (res.status !== 200) {
      return { ok: false, error: `HTTP ${res.status}`, code: res.status };
    }
    const err = res.data?.error as { message?: string; code?: number } | undefined;
    if (err) {
      return { ok: false, error: err.message ?? JSON.stringify(err), code: err.code };
    }
    if (!Array.isArray(res.data?.data)) {
      return { ok: false, error: 'Missing data array', code: undefined };
    }
    return { ok: true };
  } catch (e) {
    const ax = e as { response?: { status?: number; data?: { error?: { message?: string; code?: number } } } };
    const msg = ax.response?.data?.error?.message ?? (e as Error).message;
    const code = ax.response?.data?.error?.code ?? ax.response?.status;
    return { ok: false, error: msg, code };
  }
}

/**
 * Probe every candidate Page metric (one request each) and persist VALID/INVALID/UNAVAILABLE.
 */
export async function discoverPageDayMetrics(params: {
  socialAccountId: string;
  pageId: string;
  accessToken: string;
  since: string;
  until: string;
}): Promise<{ valid: string[]; invalid: string[]; unavailable: string[] }> {
  const { socialAccountId, pageId, accessToken, since, until } = params;
  await invalidateStaleFacebookDiscovery(socialAccountId);
  const valid: string[] = [];
  const invalid: string[] = [];
  const unavailable: string[] = [];
  for (const metric of FACEBOOK_PAGE_DAY_METRIC_CANDIDATES) {
    const r = await probePageDayMetric(pageId, accessToken, metric, since, until);
    let status: FacebookMetricProbeStatus;
    if (r.ok) {
      status = FacebookMetricProbeStatus.VALID;
      valid.push(metric);
    } else {
      status = classifyProbeError(r.code, r.error);
      if (status === FacebookMetricProbeStatus.UNAVAILABLE) unavailable.push(metric);
      else invalid.push(metric);
    }
    await upsertProbe({
      socialAccountId,
      pageId,
      scope: PAGE_INSIGHTS_DAY_SCOPE,
      metricName: metric,
      status,
      lastError: r.ok ? null : r.error ?? null,
    });
  }
  return { valid, invalid, unavailable };
}

/**
 * Probe post-level metrics once using a representative post id (same names apply to all posts on the Page).
 */
export async function discoverPostLifetimeMetrics(params: {
  socialAccountId: string;
  pageId: string;
  samplePostId: string;
  accessToken: string;
}): Promise<{ valid: string[]; invalid: string[]; unavailable: string[] }> {
  const { socialAccountId, pageId, samplePostId, accessToken } = params;
  await invalidateStaleFacebookDiscovery(socialAccountId);
  const valid: string[] = [];
  const invalid: string[] = [];
  const unavailable: string[] = [];
  for (const metric of FACEBOOK_POST_LIFETIME_METRIC_CANDIDATES) {
    const r = await probePostLifetimeMetric(samplePostId, accessToken, metric);
    let status: FacebookMetricProbeStatus;
    if (r.ok) {
      status = FacebookMetricProbeStatus.VALID;
      valid.push(metric);
    } else {
      status = classifyProbeError(r.code, r.error);
      if (status === FacebookMetricProbeStatus.UNAVAILABLE) unavailable.push(metric);
      else invalid.push(metric);
    }
    await upsertProbe({
      socialAccountId,
      pageId,
      scope: POST_INSIGHTS_LIFETIME_SCOPE,
      metricName: metric,
      status,
      lastError: r.ok ? null : r.error ?? null,
    });
  }
  return { valid, invalid, unavailable };
}

export async function getCachedValidPageDayMetrics(socialAccountId: string): Promise<string[]> {
  const rows = await prisma.facebookMetricDiscovery.findMany({
    where: {
      socialAccountId,
      scope: PAGE_INSIGHTS_DAY_SCOPE,
      graphVersion: META_GRAPH_INSIGHTS_VERSION,
      status: FacebookMetricProbeStatus.VALID,
    },
    select: { metricName: true },
  });
  return rows.map((r) => r.metricName);
}

export async function getCachedValidPostLifetimeMetrics(socialAccountId: string): Promise<string[]> {
  const rows = await prisma.facebookMetricDiscovery.findMany({
    where: {
      socialAccountId,
      scope: POST_INSIGHTS_LIFETIME_SCOPE,
      graphVersion: META_GRAPH_INSIGHTS_VERSION,
      status: FacebookMetricProbeStatus.VALID,
    },
    select: { metricName: true },
  });
  return rows.map((r) => r.metricName);
}

function cacheNeedsRefresh(validatedAt: Date): boolean {
  return Date.now() - validatedAt.getTime() > FACEBOOK_METRIC_DISCOVERY_TTL_MS;
}

/** Return VALID page day metric names; re-run discovery when cache empty or stale. */
export async function getOrDiscoverPageDayMetrics(params: {
  socialAccountId: string;
  pageId: string;
  accessToken: string;
  since: string;
  until: string;
}): Promise<{ metrics: string[]; discoveryRan: boolean }> {
  const { socialAccountId, pageId, accessToken, since, until } = params;
  await invalidateStaleFacebookDiscovery(socialAccountId);
  const existing = await prisma.facebookMetricDiscovery.findMany({
    where: {
      socialAccountId,
      scope: PAGE_INSIGHTS_DAY_SCOPE,
      graphVersion: META_GRAPH_INSIGHTS_VERSION,
    },
  });
  const anyStale = existing.some((r) => cacheNeedsRefresh(r.validatedAt));
  const validNames = existing
    .filter((r) => r.status === FacebookMetricProbeStatus.VALID)
    .map((r) => r.metricName);
  // Re-run probes only when empty cache or TTL expired. If every candidate is INVALID, keep cache (avoid probing on every request).
  if (existing.length === 0 || anyStale) {
    await discoverPageDayMetrics({ socialAccountId, pageId, accessToken, since, until });
    const after = await getCachedValidPageDayMetrics(socialAccountId);
    return { metrics: after, discoveryRan: true };
  }
  return { metrics: validNames, discoveryRan: false };
}

export async function getOrDiscoverPostLifetimeMetrics(params: {
  socialAccountId: string;
  pageId: string;
  samplePostId: string | null;
  accessToken: string;
}): Promise<{ metrics: string[]; discoveryRan: boolean }> {
  const { socialAccountId, pageId, samplePostId, accessToken } = params;
  if (!samplePostId) return { metrics: [], discoveryRan: false };
  await invalidateStaleFacebookDiscovery(socialAccountId);
  const existing = await prisma.facebookMetricDiscovery.findMany({
    where: {
      socialAccountId,
      scope: POST_INSIGHTS_LIFETIME_SCOPE,
      graphVersion: META_GRAPH_INSIGHTS_VERSION,
    },
  });
  const anyStale = existing.some((r) => cacheNeedsRefresh(r.validatedAt));
  const validNames = existing
    .filter((r) => r.status === FacebookMetricProbeStatus.VALID)
    .map((r) => r.metricName);
  if (existing.length === 0 || anyStale) {
    await discoverPostLifetimeMetrics({ socialAccountId, pageId, samplePostId, accessToken });
    const after = await getCachedValidPostLifetimeMetrics(socialAccountId);
    return { metrics: after, discoveryRan: true };
  }
  return { metrics: validNames, discoveryRan: false };
}
