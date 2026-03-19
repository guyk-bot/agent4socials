# Persistent follower/following and insights history (Instagram & Facebook)

**Scope:** Instagram and Facebook only. **YouTube is explicitly excluded** and keeps using platform API data only.

## Why we do this

- **Follower/following:** Platforms do not provide historical follower/following counts per day. We build our own history from the moment a user connects so the Growth chart can show real fluctuation over time.
- **All API metrics:** Meta only returns insights for a limited window (e.g. 28 days Instagram, 90 days Facebook). We persist every metric we get (impressions, reach, profile views, page views, etc.) into `AccountMetricSnapshot.insightsJson` so that when the platform window rolls forward, we still have the full timeline from the day the user connected. The insights API then merges snapshot-backed series with live API data so the user can track everything from connection time.

## Data model

### SocialAccount (additions)

- **firstConnectedAt** – Set once, the first time this app ever connects that external account for that user. Never cleared on disconnect.
- **connectedAt** – Set on each connect/reconnect.
- **disconnectedAt** – Set on disconnect; cleared on reconnect.

### AccountMetricSnapshot

- **userId**, **socialAccountId**, **platform**, **externalAccountId** (same as `platformUserId`)
- **metricDate** (YYYY-MM-DD), **metricTimestamp**
- **followersCount**, **followingCount** (Instagram), **fansCount** (Facebook)
- **insightsJson** (optional) – Per-day metrics from platform APIs: impressions, reach, profile_views, page_impressions, page_views_total, page_engaged_users, etc. Stored as a JSON object so we retain full history beyond Meta’s 28/90-day window.
- **source**: `bootstrap` | `scheduled_sync` | `manual_refresh`
- Unique: `(userId, platform, externalAccountId, metricDate)` – one snapshot per account per day.

Indexes: `(userId, platform, externalAccountId, metricTimestamp)`, `(socialAccountId, metricDate)`.

## Connection / reconnect / disconnect

- **Connect (first time):** Create `SocialAccount`, set `firstConnectedAt` and `connectedAt`. Then call `ensureBootstrapSnapshotForToday()` for IG/FB.
- **Reconnect (same account):** Find by `userId` + `platform` + `platformUserId`; update tokens, `status = 'connected'`, `connectedAt = now`, `disconnectedAt = null`. **Do not** clear `firstConnectedAt` or delete snapshots. Then call `ensureBootstrapSnapshotForToday()`.
- **Disconnect:** Set `status = 'disconnected'`, `disconnectedAt = now`, clear tokens. **Never** delete the row or any `AccountMetricSnapshot` rows.

Accounts list API returns only `status = 'connected'`, so disconnected accounts disappear from the UI but history is preserved for reconnect.

## Snapshot collection

1. **Bootstrap on connect/reconnect** – `ensureBootstrapSnapshotForToday()` in OAuth callback for Instagram and Facebook only.
2. **Daily cron** – `GET/POST /api/cron/metric-snapshots` (header `X-Cron-Secret: CRON_SECRET`). Calls `runDailyMetricSnapshotSync()` which fetches current metrics for all connected IG/FB accounts and upserts one row per account per day.

## Chart data (insights API)

For **Instagram** and **Facebook** only (YouTube unchanged):

- **Follower/following:** Load `getAccountHistorySeries(since, until)` from `AccountMetricSnapshot`. If **≥ 2 snapshots** return real `followersTimeSeries` (and for IG `followingTimeSeries`) from DB; otherwise build a **bootstrap flat series** from `firstConnectedAt` through range end. Set `metricHistoryFromSnapshots: true`, `isBootstrap` as appropriate.
- **Impressions, reach, page views, etc.:** Every time we fetch insights from Meta we persist the returned time series into `insightsJson` via `persistInsightsSeries()`. When building the response we merge snapshot-backed series with live API data: `mergeSeriesWithSnapshots(apiSeries, getInsightsTimeSeries(...), since, until)` so the user sees the full requested range from connection date (API values take precedence for overlapping dates).

Response also includes **firstConnectedAt** and **isBootstrap** so the frontend can show: “Tracking started on [date]. Historical growth is collected from the moment you connected this account.” (only when `isBootstrap` and for IG/FB).

## Key files

| What | Where |
|------|--------|
| Snapshot service | `apps/web/src/lib/analytics/metric-snapshots.ts` |
| Insights (inject snapshot/bootstrap series) | `apps/web/src/app/api/social/accounts/[id]/insights/route.ts` |
| OAuth callback (firstConnectedAt, bootstrap) | `apps/web/src/app/api/social/oauth/[platform]/callback/route.ts` |
| Soft disconnect | `apps/web/src/app/api/social/accounts/[id]/route.ts` (DELETE) |
| Accounts list (connected only) | `apps/web/src/app/api/social/accounts/route.ts` |
| Daily cron | `apps/web/src/app/api/cron/metric-snapshots/route.ts` |

**Deploy:** See **docs/DEPLOY_METRIC_SNAPSHOTS.md** for step-by-step: run migration with `DATABASE_DIRECT_URL`, set `CRON_SECRET`, and schedule the cron (Vercel Cron or cron-job.org).

Migrations:
- `apps/web/prisma/migrations/20260318120000_metric_snapshots_and_connection_history/` – SocialAccount fields + AccountMetricSnapshot table.
- `apps/web/prisma/migrations/20260318130000_add_insights_json_to_snapshots/` – adds `insightsJson` to AccountMetricSnapshot. For Supabase SQL Editor run: `ALTER TABLE "AccountMetricSnapshot" ADD COLUMN IF NOT EXISTS "insightsJson" JSONB;`

## YouTube

- No snapshot logic, no bootstrap, no cron for YouTube.
- Growth chart for YouTube uses only existing platform/API data (e.g. subscribers from YouTube API).

## Edge cases

- **Reconnect same account** – Same row updated; snapshots preserved; chart continues from full history.
- **Different account** – Different `platformUserId` → separate row and separate history.
- **Null metric from API** – Upsert only updates snapshot fields when value is non-null (do not overwrite with null).
- **Same-day reconnect** – Upsert on unique key avoids duplicate daily rows.
