/**
 * Facebook pipeline validation (local / CI with DATABASE_URL + live token).
 *
 * Run from apps/web:
 *   npx tsx scripts/facebook-pipeline-validation.ts
 *   npx tsx scripts/facebook-pipeline-validation.ts --socialAccountId=<cuid>
 *
 * Prints raw Graph bodies (tokens redacted in logged URLs), DB readbacks, and a final 3-section report.
 * Writes: FacebookPageInsightDaily (TEST 1), merges platformMetadata on selected posts (TEST 2–3).
 */

import axios from 'axios';
import { Prisma } from '@prisma/client';
import { prisma } from '../src/lib/db';
import { metaGraphInsightsBaseUrl, META_GRAPH_FACEBOOK_API_VERSION } from '../src/lib/meta-graph-insights';
import { persistFacebookPageInsightsNormalized } from '../src/lib/facebook/persist-page-insights';
import type { FacebookInsightMetricRow } from '../src/lib/facebook/types';
import { resolvePostInsightMetricsForSync } from '../src/lib/facebook/fetchers';
import { getOrDiscoverPostLifetimeMetrics } from '../src/lib/facebook/discovery';

const PAGE_METRICS = ['page_views_total', 'page_follows', 'page_post_engagements'] as const;

function redact(s: string): string {
  return s.replace(/access_token=[^&\s]+/gi, 'access_token=REDACTED');
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function parseArgs(): { socialAccountId?: string } {
  const out: { socialAccountId?: string } = {};
  for (const a of process.argv.slice(2)) {
    const m = a.match(/^--socialAccountId=(.+)$/);
    if (m) out.socialAccountId = m[1];
  }
  return out;
}

function rowToSeries(row: FacebookInsightMetricRow | undefined): Array<{ date: string; value: number }> {
  if (!row?.values?.length) return [];
  const pts: Array<{ date: string; value: number }> = [];
  for (const v of row.values) {
    if (!v.end_time) continue;
    const date = v.end_time.slice(0, 10);
    const n = typeof v.value === 'number' ? v.value : Number(v.value);
    if (!Number.isFinite(n)) continue;
    pts.push({ date, value: n });
  }
  pts.sort((a, b) => a.date.localeCompare(b.date));
  return pts;
}

function classifyFailure(status: number, body: unknown): string {
  const b = body as { error?: { code?: number; message?: string; type?: string } } | null;
  const code = b?.error?.code;
  const msg = (b?.error?.message ?? '').toLowerCase();
  if (status === 400 && msg.includes('metric')) return 'invalid metric';
  if (status === 400 && (msg.includes('deprecated') || code === 12)) return 'unsupported/deprecated endpoint or metric';
  if (status === 403 || code === 200 || code === 10 || msg.includes('permission')) return 'permission issue';
  if (status === 404) return 'unsupported endpoint or object not found';
  if (b?.error && msg.includes('no data')) return 'no data available';
  if (b?.error) return `other (http ${status}, code ${code ?? 'n/a'}: ${b.error.message ?? JSON.stringify(b.error)})`;
  if (status !== 200) return `other (http ${status})`;
  return 'no error';
}

type Report = {
  page: {
    status: 'confirmed' | 'not_confirmed';
    evidence: string[];
    sampleRows: unknown[];
    dedupNote: string;
  };
  post: {
    status: 'confirmed' | 'partially_working' | 'not_confirmed';
    testedPostIds: string[];
    endpointsTried: string[];
    worked: string[];
    failed: Array<{ endpoint: string; reason: string }>;
  };
  engagement: {
    comments: 'working' | 'not_working';
    reactions: 'working' | 'not_working';
    breakdowns: 'native' | 'self_aggregated' | 'unavailable';
    sampleStored: unknown;
    sampleAggregation: unknown;
    evidence: string[];
  };
};

async function main() {
  const args = parseArgs();
  const report: Report = {
    page: { status: 'not_confirmed', evidence: [], sampleRows: [], dedupNote: '' },
    post: { status: 'not_confirmed', testedPostIds: [], endpointsTried: [], worked: [], failed: [] },
    engagement: {
      comments: 'not_working',
      reactions: 'not_working',
      breakdowns: 'unavailable',
      sampleStored: null,
      sampleAggregation: null,
      evidence: [],
    },
  };

  console.log('\n========== FACEBOOK PIPELINE VALIDATION ==========');
  console.log('Graph version:', META_GRAPH_FACEBOOK_API_VERSION);
  console.log('Base URL:', metaGraphInsightsBaseUrl);

  const account = await prisma.socialAccount.findFirst({
    where: {
      platform: 'FACEBOOK',
      status: 'connected',
      ...(args.socialAccountId ? { id: args.socialAccountId } : {}),
    },
    orderBy: { updatedAt: 'desc' },
    select: {
      id: true,
      userId: true,
      platformUserId: true,
      username: true,
      accessToken: true,
    },
  });

  if (!account) {
    console.error('No connected Facebook SocialAccount found. Connect a Page or pass --socialAccountId=<id>.');
    process.exit(1);
  }

  const pageId = account.platformUserId;
  const token = account.accessToken;
  console.log('\nUsing SocialAccount:', account.id, 'pageId:', pageId, 'username:', account.username);

  const until = isoDate(new Date());
  const since = isoDate(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000));
  console.log('Page insights date range (day):', since, 'to', until);

  // ----- TEST 1 -----
  console.log('\n\n--- TEST 1: PAGE METRIC STORAGE ---\n');

  let test1AnySuccess = false;
  let rawSamplePrinted = false;
  let normalizedSamplePrinted = false;

  for (const metric of PAGE_METRICS) {
    const url = `${metaGraphInsightsBaseUrl}/${pageId}/insights`;
    const params = { metric, period: 'day', since, until, access_token: token };
    console.log(`\n[${metric}] GET ${redact(url + '?' + new URLSearchParams(params as Record<string, string>).toString())}`);

    const res = await axios.get<{ data?: FacebookInsightMetricRow[]; error?: { message?: string; code?: number } }>(
      url,
      { params, timeout: 20_000, validateStatus: () => true }
    );

    console.log(`[${metric}] HTTP ${res.status}`);
    console.log(`[${metric}] RAW BODY:\n${JSON.stringify(res.data, null, 2)}`);

    if (res.data?.error || res.status !== 200) {
      report.page.evidence.push(`${metric}: fetch failed ${classifyFailure(res.status, res.data)}`);
      continue;
    }

    test1AnySuccess = true;
    if (!rawSamplePrinted) {
      report.page.evidence.push(`Raw response sample (${metric}): ${JSON.stringify(res.data).slice(0, 500)}…`);
      rawSamplePrinted = true;
    }

    const row = res.data.data?.[0];
    const series = rowToSeries(row);
    const normalized = { metricKey: metric, series };
    console.log(`[${metric}] NORMALIZED (internal series shape):\n${JSON.stringify(normalized, null, 2)}`);
    if (!normalizedSamplePrinted && series.length) {
      report.page.evidence.push(`Normalized sample: ${JSON.stringify(normalized).slice(0, 400)}…`);
      normalizedSamplePrinted = true;
    }

    const persist1 = await persistFacebookPageInsightsNormalized({
      userId: account.userId,
      socialAccountId: account.id,
      pageId,
      seriesByGraphMetric: { [metric]: series },
    });
    console.log(`[${metric}] persist pass 1 — dailyRowsUpserted (operations):`, persist1.dailyRowsUpserted);

    const read1 = await prisma.facebookPageInsightDaily.findMany({
      where: { socialAccountId: account.id, metricKey: metric, metricDate: { gte: since, lte: until } },
      orderBy: { metricDate: 'asc' },
    });
    console.log(`[${metric}] DB READBACK after pass 1 (${read1.length} rows):\n${JSON.stringify(read1, null, 2)}`);

    const countBefore = await prisma.facebookPageInsightDaily.count({
      where: { socialAccountId: account.id, metricKey: metric },
    });

    const persist2 = await persistFacebookPageInsightsNormalized({
      userId: account.userId,
      socialAccountId: account.id,
      pageId,
      seriesByGraphMetric: { [metric]: series },
    });
    console.log(`[${metric}] persist pass 2 — dailyRowsUpserted:`, persist2.dailyRowsUpserted);

    const countAfter = await prisma.facebookPageInsightDaily.count({
      where: { socialAccountId: account.id, metricKey: metric },
    });
    console.log(`[${metric}] Row count metric-wide before/after second upsert:`, countBefore, '→', countAfter);
    if (countBefore === countAfter) {
      console.log(`[${metric}] DEDUP: OK (no duplicate rows from second upsert)`);
    } else {
      console.log(`[${metric}] DEDUP: UNEXPECTED count changed`);
    }

    report.page.sampleRows.push(...read1.slice(0, 3));
  }

  if (test1AnySuccess) {
    report.page.status = 'confirmed';
    report.page.evidence.push('At least one page metric fetched, persisted, and read back from facebook_page_insight_daily.');
    report.page.dedupNote = 'Second persist used same unique key (socialAccountId, metricKey, metricDate); row totals should match pass 1.';
  } else {
    report.page.evidence.push('No successful page metric fetches; storage path not exercised.');
  }

  // ----- TEST 2 -----
  console.log('\n\n--- TEST 2: POST-LEVEL ANALYTICS ---\n');

  const posts = await prisma.importedPost.findMany({
    where: { socialAccountId: account.id, platform: 'FACEBOOK' },
    orderBy: { publishedAt: 'desc' },
    take: 3,
    select: { id: true, platformPostId: true, platformMetadata: true },
  });

  if (posts.length === 0) {
    console.log('No ImportedPost rows for this account. Sync posts first, or validation will skip post tests.');
    report.post.status = 'not_confirmed';
    report.post.failed.push({
      endpoint: '(no posts)',
      reason: 'no ImportedPost rows; run posts sync',
    });
  } else {
    report.post.testedPostIds = posts.map((p) => p.platformPostId);
    const samplePostId = posts[0].platformPostId;

    const discovery = await getOrDiscoverPostLifetimeMetrics({
      socialAccountId: account.id,
      pageId,
      samplePostId,
      accessToken: token,
    });
    console.log('Post lifetime discovery metrics count:', discovery.metrics.length);
    console.log('Sample metrics (first 15):', discovery.metrics.slice(0, 15));

    const ordered = await resolvePostInsightMetricsForSync({
      socialAccountId: account.id,
      pageId,
      accessToken: token,
      samplePostId,
    });
    let slice = ordered.slice(0, 8);
    if (slice.length === 0) {
      console.log('No registry post metrics yet; trying common lifetime names (may fail if invalid for this post).');
      slice = ['post_impressions', 'post_engaged_users', 'post_video_views', 'post_media_view'];
    }

    for (const post of posts) {
      console.log(`\n--- Post ${post.platformPostId} (db ${post.id}) ---`);
      const map: Record<string, number> = {};
      for (const m of slice) {
        const ep = `${metaGraphInsightsBaseUrl}/${post.platformPostId}/insights`;
        const fullUrl = `${ep}?${new URLSearchParams({ metric: m, access_token: token }).toString()}`;
        report.post.endpointsTried.push(redact(fullUrl));

        const r = await axios.get(`${ep}`, {
          params: { metric: m, access_token: token },
          timeout: 15_000,
          validateStatus: () => true,
        });
        console.log(`ENDPOINT: ${redact(r.config.url ?? ep)}`);
        console.log(`HTTP ${r.status} RAW:\n${JSON.stringify(r.data, null, 2)}`);

        const body = r.data as {
          data?: Array<{ name?: string; values?: Array<{ value?: number }> }>;
          error?: { message?: string; code?: number };
        };
        if (body.error || r.status !== 200) {
          report.post.failed.push({
            endpoint: `${post.platformPostId}/insights?metric=${m}`,
            reason: classifyFailure(r.status, r.data),
          });
          continue;
        }
        report.post.worked.push(`${post.platformPostId} insights metric=${m}`);
        const row = body.data?.[0];
        const v = row?.values?.[0]?.value;
        if (typeof v === 'number' && v >= 0) map[m] = v;
      }

      console.log(`Merged insight map for ${post.platformPostId}:`, JSON.stringify(map, null, 2));

      const prev =
        (post.platformMetadata && typeof post.platformMetadata === 'object'
          ? post.platformMetadata
          : {}) as Record<string, unknown>;
      const nextMeta = {
        ...prev,
        facebookInsights: { ...(typeof prev.facebookInsights === 'object' ? prev.facebookInsights : {}), ...map },
        __fbPipelineValidation: {
          ...(typeof prev.__fbPipelineValidation === 'object' ? prev.__fbPipelineValidation : {}),
          postInsightsAt: new Date().toISOString(),
          postInsightKeys: Object.keys(map),
        },
      };

      await prisma.importedPost.update({
        where: { id: post.id },
        data: { platformMetadata: nextMeta as Prisma.InputJsonValue },
      });

      const reread = await prisma.importedPost.findUnique({
        where: { id: post.id },
        select: { platformPostId: true, platformMetadata: true },
      });
      console.log('DB READBACK platformMetadata.facebookInsights + validation keys:\n', JSON.stringify(reread?.platformMetadata, null, 2));
    }

    const workedN = report.post.worked.length;
    const failedN = report.post.failed.length;
    if (workedN > 0 && failedN === 0) report.post.status = 'confirmed';
    else if (workedN > 0) report.post.status = 'partially_working';
    else report.post.status = 'not_confirmed';
  }

  // ----- TEST 3 -----
  console.log('\n\n--- TEST 3: ENGAGEMENT OBJECTS (comments / reactions) ---\n');

  const postForEng = await prisma.importedPost.findFirst({
    where: { socialAccountId: account.id, platform: 'FACEBOOK' },
    orderBy: { publishedAt: 'desc' },
    select: { id: true, platformPostId: true, platformMetadata: true },
  });

  if (!postForEng) {
    console.log('Skip TEST 3: no posts.');
    report.engagement.evidence.push('Skipped: no ImportedPost.');
  } else {
    const pid = postForEng.platformPostId;

    const commentsUrl = `${metaGraphInsightsBaseUrl}/${pid}/comments`;
    const cr = await axios.get(commentsUrl, {
      params: {
        fields: 'id,message,created_time,from,permalink_url',
        limit: 10,
        access_token: token,
      },
      timeout: 15_000,
      validateStatus: () => true,
    });
    console.log('COMMENTS ENDPOINT:', redact(`${commentsUrl}?fields=...&limit=10&access_token=REDACTED`));
    console.log(`COMMENTS HTTP ${cr.status} RAW:\n${JSON.stringify(cr.data, null, 2)}`);

    const reactionsUrl = `${metaGraphInsightsBaseUrl}/${pid}/reactions`;
    const rr = await axios.get(reactionsUrl, {
      params: {
        fields: 'id,name,type',
        limit: 15,
        access_token: token,
      },
      timeout: 15_000,
      validateStatus: () => true,
    });
    console.log('REACTIONS ENDPOINT:', redact(`${reactionsUrl}?fields=id,name,type&limit=15&access_token=REDACTED`));
    console.log(`REACTIONS HTTP ${rr.status} RAW:\n${JSON.stringify(rr.data, null, 2)}`);

    const summaryUrl = `${metaGraphInsightsBaseUrl}/${pid}`;
    const sr = await axios.get(summaryUrl, {
      params: {
        fields: 'reactions.summary(true).limit(0),comments.summary(true).limit(0)',
        access_token: token,
      },
      timeout: 15_000,
      validateStatus: () => true,
    });
    console.log('POST SUMMARY FIELDS ENDPOINT:', redact(`${summaryUrl}?fields=reactions.summary...&access_token=REDACTED`));
    console.log(`SUMMARY HTTP ${sr.status} RAW:\n${JSON.stringify(sr.data, null, 2)}`);

    const commentsData = cr.data as { data?: unknown[]; paging?: { next?: string } };
    const reactionsData = rr.data as { data?: Array<{ type?: string }>; paging?: { next?: string } };
    const summaryData = sr.data as {
      reactions?: { summary?: { total_count?: number } };
      comments?: { summary?: { total_count?: number } };
      error?: { message?: string };
    };

    const commentsErr = (cr.data as { error?: unknown }).error;
    if (cr.status === 200 && !commentsErr) {
      report.engagement.comments = 'working';
      report.engagement.evidence.push(
        `Comments edge OK; ${commentsData.data?.length ?? 0} objects on first page` +
          (commentsData.paging?.next ? ' (more pages via paging.next).' : '.')
      );
    } else {
      report.engagement.evidence.push(`Comments: ${classifyFailure(cr.status, cr.data)}`);
    }

    const reactionsErr = (rr.data as { error?: unknown }).error;
    if (rr.status === 200 && !reactionsErr) {
      report.engagement.reactions = 'working';
      report.engagement.evidence.push(
        `Reactions edge OK; ${reactionsData.data?.length ?? 0} objects on first page` +
          (reactionsData.paging?.next ? ' (more pages).' : '.')
      );
    } else {
      report.engagement.evidence.push(`Reactions objects edge: ${classifyFailure(rr.status, rr.data)}`);
    }

    if (sr.status === 200 && summaryData.reactions?.summary && summaryData.comments?.summary) {
      report.engagement.breakdowns = 'native';
      report.engagement.evidence.push('Native summaries on post: reactions.summary.total_count, comments.summary.total_count.');
    } else if (reactionsData.data?.length) {
      report.engagement.breakdowns = 'self_aggregated';
      report.engagement.evidence.push('Summaries missing or partial; can aggregate from reaction objects by type.');
    }

    const byType: Record<string, number> = {};
    for (const r of reactionsData.data ?? []) {
      const t = r.type ?? 'UNKNOWN';
      byType[t] = (byType[t] ?? 0) + 1;
    }
    const aggregation = {
      commentsPageCount: commentsData.data?.length ?? 0,
      commentsHasPagingNext: Boolean(commentsData.paging?.next),
      reactionObjectsPageCount: reactionsData.data?.length ?? 0,
      reactionHasPagingNext: Boolean(reactionsData.paging?.next),
      reactionsByTypeThisPage: byType,
      nativeReactionTotal: summaryData.reactions?.summary?.total_count,
      nativeCommentTotal: summaryData.comments?.summary?.total_count,
    };
    report.engagement.sampleAggregation = aggregation;
    console.log('SAMPLE COMPUTED AGGREGATION:\n', JSON.stringify(aggregation, null, 2));

    const prevE =
      (postForEng.platformMetadata && typeof postForEng.platformMetadata === 'object'
        ? postForEng.platformMetadata
        : {}) as Record<string, unknown>;
    const normalizedEngagement = {
      commentsSample: (commentsData.data ?? []).slice(0, 5),
      reactionsSample: (reactionsData.data ?? []).slice(0, 5),
      summaryFields: {
        reactionTotal: summaryData.reactions?.summary?.total_count ?? null,
        commentTotal: summaryData.comments?.summary?.total_count ?? null,
      },
    };
    const nextE = {
      ...prevE,
      __fbPipelineValidation: {
        ...(typeof prevE.__fbPipelineValidation === 'object' ? prevE.__fbPipelineValidation : {}),
        engagementAt: new Date().toISOString(),
        engagement: normalizedEngagement,
      },
    };

    await prisma.importedPost.update({
      where: { id: postForEng.id },
      data: { platformMetadata: nextE as Prisma.InputJsonValue },
    });

    const engRead = await prisma.importedPost.findUnique({
      where: { id: postForEng.id },
      select: { platformPostId: true, platformMetadata: true },
    });
    const pm = engRead?.platformMetadata as Record<string, unknown> | undefined;
    report.engagement.sampleStored = pm?.__fbPipelineValidation;
    console.log('STORED __fbPipelineValidation.engagement (readback):\n', JSON.stringify(report.engagement.sampleStored, null, 2));
  }

  // ----- FINAL REPORT -----
  console.log('\n\n========== VALIDATION REPORT ==========\n');

  console.log('1. PAGE METRIC STORAGE');
  console.log('   Status:', report.page.status === 'confirmed' ? 'Confirmed working' : 'Not confirmed');
  console.log('   Evidence:', report.page.evidence.join(' | '));
  console.log('   Sample stored rows (up to 3 combined):', JSON.stringify(report.page.sampleRows.slice(0, 3), null, 2));
  console.log('   Dedup/upsert:', report.page.dedupNote);

  console.log('\n2. POST-LEVEL ANALYTICS');
  console.log('   Status:', report.post.status);
  console.log('   Tested post IDs:', report.post.testedPostIds.join(', ') || '(none)');
  console.log('   Endpoints (redacted, subset):', report.post.endpointsTried.slice(0, 6).join('\n      '));
  console.log('   Confirmed working calls:', report.post.worked.length ? report.post.worked.slice(0, 12).join('; ') : '(none)');
  console.log('   Failed:', JSON.stringify(report.post.failed, null, 2));

  console.log('\n3. ENGAGEMENT OBJECTS');
  console.log('   Comments:', report.engagement.comments);
  console.log('   Reactions:', report.engagement.reactions);
  console.log('   Breakdowns:', report.engagement.breakdowns);
  console.log('   Evidence:', report.engagement.evidence.join(' | '));
  console.log('   Sample stored:', JSON.stringify(report.engagement.sampleStored, null, 2));
  console.log('   Sample aggregation:', JSON.stringify(report.engagement.sampleAggregation, null, 2));

  console.log('\n--- FINAL SUMMARY ---');
  console.log(
    'Proven now: page insight fetch+persist+readback (when Graph returns data); post /insights per metric when valid; engagement edges when permitted.'
  );
  console.log(
    'Unproven if empty: day series for brand-new pages, or posts sync never run (no post IDs).'
  );
  console.log(
    'Meta vs us: (#100) invalid metric names are Meta; missing tables for comment rows are product choice (currently JSON on ImportedPost).'
  );

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
