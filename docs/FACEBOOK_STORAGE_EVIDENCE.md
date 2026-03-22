# Facebook analytics: database storage evidence

Your Graph JSON proves **API access**. To prove **our storage layer**, use the evidence endpoint or SQL below. Nothing here replaces a live DB: you must run this against the environment where the app connects (production Supabase, etc.).

## 1) Authenticated JSON report (recommended)

**GET** `/api/social/accounts/{facebookSocialAccountId}/facebook-storage-evidence`

Headers: same `Authorization` as other dashboard APIs (Bearer JWT the app uses for `/insights`).

**Optional write + readback proof:** add query `storageProof=1`. That will:

1. Call Graph for `page_views_total` (day, last 7 days).
2. Print-equivalent in JSON: `rawApiResponseBody`, `normalizedSeriesForPersist`.
3. Call `persistFacebookPageInsightsNormalized` (upserts `facebook_page_insight_daily` + merges `AccountMetricSnapshot.insightsJson`).
4. Return `facebookPageInsightDailyAfterUpsertSample` (up to 5 rows).

Without `storageProof=1`, the response is **read-only**: table existence (`to_regclass`), latest 5 discovery rows, latest 5 daily rows, 3 snapshot rows with `insightsJson`, plus static Prisma/migration references and frontend data-flow notes.

## 2) Prisma models (source of truth)

Defined in `apps/web/prisma/schema.prisma`:

- **`FacebookMetricDiscovery`**: cache of probed metric names per Page (`VALID` / `INVALID` / …), keyed by `(socialAccountId, scope, metricName)`.
- **`FacebookPageInsightDaily`**: **one row per `(socialAccountId, metricKey, metricDate)`** (normalized page day values). Table name in Postgres: `facebook_page_insight_daily`.
- **`AccountMetricSnapshot`**: daily row with `insightsJson` JSON blob; this is what **`getInsightsTimeSeries`** reads when merging history into the insights response.

## 3) Migrations that create the tables

| Object | Migration folder |
|--------|------------------|
| `FacebookMetricDiscovery`, `FacebookSyncRun`, enum `FacebookMetricProbeStatus`, `ImportedPost.platformMetadata` | `apps/web/prisma/migrations/20260322180000_facebook_analytics_discovery/` |
| `facebook_page_insight_daily` | `apps/web/prisma/migrations/20260324100000_facebook_page_insight_daily/` |

Manual repair SQL (if `migrate deploy` never ran on Vercel): `apps/web/scripts/ensure-facebook-metric-discovery.sql` plus run the page-insight-daily migration or its SQL.

## 4) Daily row shape (no separate date_start / date_end in DB)

Meta returns each **day** point with `end_time` (ISO). We map that to **`metricDate`** = calendar date string (YYYY-MM-DD) via `facebookMetricDateFromEndTime` in `apps/web/src/lib/facebook/dates.ts`. There is no second column for `date_end`; one row = one day bucket for that metric.

Sample columns you should see in `facebook_page_insight_daily`:

- `pageId` (Facebook Page id)
- `metric_key` (Prisma `metricKey`)
- `metric_date` (Prisma `metricDate`)
- `value`, `fetched_at`, `updated_at`, `created_at` (via Prisma defaults on related models)

## 5) Frontend: what the UI actually consumes

| Step | Location |
|------|-----------|
| Client fetch | `apps/web/src/app/dashboard/page.tsx` → `api.get('/social/accounts/${id}/insights', { params: { since, until, extended: 1 } })` |
| Server | `apps/web/src/app/api/social/accounts/[id]/insights/route.ts` (Facebook branch) |
| Live metrics | `fetchMergedFacebookPageDayInsights` → Graph |
| Persist | `persistFacebookPageInsightsNormalized` → **`AccountMetricSnapshot`** (`persistInsightsSeries`) **and** **`facebook_page_insight_daily`** |
| Merge for charts | `getInsightsTimeSeries` reads **`AccountMetricSnapshot.insightsJson`**, merged with live series in `mergeSeriesWithSnapshots` |

**Important:** The dashboard charts are driven by the **insights API response**, which combines **live Graph data** with **snapshot-backed** series from `insightsJson`. The UI does **not** query `facebook_page_insight_daily` directly. That table is still “real” storage (same persist path, audits, debug counts, evidence endpoint).

Payload keys the Facebook analytics UI consumes from the insights response include: `followers`, `impressionsTimeSeries`, `pageViewsTimeSeries`, `reachTotal`, `facebookPageMetricSeries`, `facebookAnalytics`, `growthTimeSeries`, `followersTimeSeries`, and optional `facebookInsightPersistence` when `extended=1`.

## 6) Discovery failure fallback (no crash)

If `FacebookMetricDiscovery` is missing or unreadable:

- `apps/web/src/lib/facebook/discovery-db.ts` probes the table; on failure, discovery cache is skipped for ~60s then retried.
- `apps/web/src/lib/facebook/discovery.ts` returns a **fallback metric list** and avoids throwing from `deleteMany` / `findMany`.

See `failureFallback` in the JSON from the storage-evidence route.

## 7) SQL you can run in Supabase (manual proof)

```sql
SELECT to_regclass('public."FacebookMetricDiscovery"') IS NOT NULL AS discovery_ok,
       to_regclass('public.facebook_page_insight_daily') IS NOT NULL AS daily_ok;

SELECT "metricName", "status", "scope", "validatedAt", "graphVersion"
FROM "FacebookMetricDiscovery"
ORDER BY "updatedAt" DESC
LIMIT 5;

SELECT "pageId", "metricKey", "metricDate", "value", "fetchedAt", "updatedAt"
FROM "facebook_page_insight_daily"
ORDER BY "metricDate" DESC, "metricKey"
LIMIT 5;
```

If `discovery_ok` or `daily_ok` is false, the failing layer is **migrations not applied** (fix `DATABASE_DIRECT_URL` and redeploy, or run manual SQL from `MIGRATE.md`).
