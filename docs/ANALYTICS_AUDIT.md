# Analytics Audit – Agent4Socials

## 1. Repository scan summary

### 1.1 Platform integrations

| Platform | Auth | Token storage | Scopes (current) |
|----------|------|---------------|------------------|
| **Instagram** (via Facebook) | `GET /api/social/oauth/instagram/start` | `SocialAccount.accessToken` | `instagram_manage_insights`, `instagram_basic`, `pages_read_engagement`, etc. |
| **Instagram** (standalone) | Same; `method=instagram` | Same | `instagram_business_manage_insights`, `instagram_business_basic`, etc. |
| **Facebook** | `GET /api/social/oauth/facebook/start` | Same (Page token) | `read_insights`, `pages_read_engagement`, etc. |
| **TikTok** | Same pattern | Same | `user.info.basic`, `user.info.stats`, `video.list` |
| **YouTube** | Same | Same + refresh | `youtube.readonly`, `yt-analytics.readonly`, etc. |
| **Twitter (X)** | Same | Same | `tweet.read`, `users.read`, etc. |
| **LinkedIn** | Same | Same | `openid`, `profile`, `w_member_social` |

### 1.2 Current analytics endpoints

- **GET /api/social/accounts/[id]/insights** – Account-level: followers, impressionsTotal, impressionsTimeSeries, pageViewsTotal, reachTotal, profileViewsTotal, insightsHint. For **Instagram and Facebook**, also returns snapshot-based or bootstrap **followersTimeSeries** (and IG **followingTimeSeries**), **firstConnectedAt**, **isBootstrap**, **metricHistoryFromSnapshots**.
- **GET /api/social/accounts/[id]/engagement** – Per-post engagement (IG/FB/YouTube).
- **GET /api/social/accounts/[id]/posts** – Post list + sync with metrics.
- **GET/POST /api/cron/metric-snapshots** – Daily job: upsert one snapshot per connected IG/FB account (X-Cron-Secret required). **YouTube excluded.**

### 1.3 DB models

- **ImportedPost**: impressions, interactions, likeCount, commentsCount, repostsCount, sharesCount. No demographics table; time series computed in API.
- **SocialAccount**: Added **firstConnectedAt**, **connectedAt**, **disconnectedAt** for connection history and soft disconnect (reconnect preserves history).
- **AccountMetricSnapshot**: Persistent follower/following/fans history for **Instagram and Facebook only**. One row per account per day (metricDate); unique (userId, platform, externalAccountId, metricDate). Used for Growth chart when ≥2 snapshots; otherwise bootstrap flat line from connection date. **YouTube excluded.** See **docs/METRIC_SNAPSHOTS_AND_HISTORY.md**.

### 1.4 Frontend

- Dashboard and Summary use `AppDataContext.getInsights()` / `getPosts()`; no demographics or raw payload yet.

---

## 2. Audit: what we fetch vs what we could fetch

### 2.1 Instagram

| Data | Current | Could fetch | Status |
|------|---------|-------------|--------|
| Followers, reach, impressions, profile views | Yes | Same | Confirmed |
| **Follower demographics** | No | `follower_demographics` breakdown: age, city, country, gender; period=lifetime, timeframe=last_14/30/90_days | Confirmed available |
| **Engaged audience demographics** | No | `engaged_audience_demographics` same breakdowns | Confirmed available |
| **Reach by product type** | No | `reach` + breakdown `media_product_type` (STORY, REELS, FEED) | Confirmed available |
| **Saves, shares, likes** | No | `saves`, `shares`, `likes` | Confirmed available |
| Language / traffic source | No | Not in IG Insights API | Unavailable |

**Limitations**: 28-day cap for some metrics; demographics top 45; ≥100 followers for some metrics.

### 2.2 Facebook (Page)

| Data | Current | Could fetch | Status |
|------|---------|-------------|--------|
| Fan count, page_impressions, page_views_total, page_engaged_users | Yes | Same | Confirmed |
| **Fans by gender/age** | No | `page_fans_gender_age`, `page_fans_country` (lifetime) | Likely – needs read_insights |
| **Impressions by country/city** | No | `page_impressions_by_country_unique`, etc. (check deprecation 2026) | Likely |
| Traffic source | No | `page_fans_by_like_source` | Likely |

**Limitations**: Page ≥100 likes; demographics if ≥100 people; max 90 days per request.

### 2.3 YouTube

| Data | Current | Could fetch | Status |
|------|---------|-------------|--------|
| Subscribers, viewCount, views time series (day) | Yes | Same | Confirmed |
| **Views by country** | No | Analytics API `dimensions=country` | Confirmed available |
| **Views by ageGroup / gender** | No | `dimensions=ageGroup`, `dimensions=gender` | Confirmed available |
| **Estimated minutes watched, avg view duration** | No | `metrics=estimatedMinutesWatched,averageViewDuration` | Confirmed available |
| **Traffic source** | No | `dimensions=insightTrafficSourceType` | Confirmed available |
| **Subscriber change** | No | `subscribersGained`, `subscribersLost` | Confirmed available |

### 2.4 TikTok

| Data | Current | Could fetch | Status |
|------|---------|-------------|--------|
| Follower count, video count, likes, per-video views | Yes | Same | Confirmed |
| Demographics / geography / traffic source | No | Not in Display/Login API | Unavailable |

### 2.5 Twitter (X)

| Data | Current | Could fetch | Status |
|------|---------|-------------|--------|
| Followers, tweet count, per-tweet metrics | Yes | Same | Confirmed |
| Audience demographics | No | Not in API | Unavailable |
| Account-level impressions time series | From recent tweets only | No historical API | Unavailable |

### 2.6 LinkedIn

| Data | Current | Could fetch | Status |
|------|---------|-------------|--------|
| firstDegreeSize (connections) | Yes | Same | Confirmed |
| Page/post analytics, demographics | No | Marketing API only (approval) | Unavailable |

---

## 3. Impossible via official APIs

- User-level analytics (all platforms aggregate only).
- TikTok: demographics, geography, traffic source.
- Twitter: audience demographics.
- LinkedIn: full analytics without Marketing API approval.
- Instagram/Facebook: language for organic insights.

---

## 4. Implementation priorities

1. Add Instagram follower_demographics + engaged_audience_demographics (country, city, age, gender).
2. Add YouTube Analytics dimensions (country, ageGroup, gender) + estimatedMinutesWatched, traffic source, subscriber change.
3. Try Facebook page_fans_gender_age / page_fans_country when available.
4. Normalized types + optional raw payload in response; graceful errors per platform.

---

## 5. Implemented (after this audit)

- **Types**: `apps/web/src/types/analytics.ts` – Demographics, TrafficSourceItem, GrowthDataPoint, ExtendedAnalytics.
- **Fetchers**: `apps/web/src/lib/analytics/extended-fetchers.ts` – fetchInstagramDemographics, fetchFacebookDemographics, fetchYouTubeExtended (country, age, gender, traffic source, watch time, subscriber growth).
- **Insights route**: `GET /api/social/accounts/[id]/insights?since=&until=&extended=1` – when `extended=1`, appends `demographics`, `trafficSources`, `growthTimeSeries`, `extra`, and `raw` (per-platform) where available. Backward compatible: without `extended` the response shape is unchanged.
- **Persistent follower/following history (Instagram & Facebook only):**
  - **Metric snapshots**: `apps/web/src/lib/analytics/metric-snapshots.ts` – fetchCurrentInstagramMetrics, fetchCurrentFacebookMetrics, upsertDailyMetricSnapshot, getAccountHistorySeries, buildBootstrapFlatSeries, ensureBootstrapSnapshotForToday, runDailyMetricSnapshotSync.
  - **Schema**: `SocialAccount.firstConnectedAt`, `connectedAt`, `disconnectedAt`; new model `AccountMetricSnapshot` (migration `20260318120000_metric_snapshots_and_connection_history`).
  - **Connect/reconnect**: OAuth callback sets firstConnectedAt (create only), connectedAt, disconnectedAt (reconnect clears); calls ensureBootstrapSnapshotForToday for IG/FB.
  - **Disconnect**: Soft disconnect (status + disconnectedAt; no row or snapshot delete). Accounts list returns only `status = 'connected'`.
  - **Cron**: `GET/POST /api/cron/metric-snapshots` runs runDailyMetricSnapshotSync for connected IG/FB accounts. **YouTube excluded.**
  - **Chart**: Insights route for IG/FB returns snapshot-based or bootstrap followersTimeSeries/followingTimeSeries; frontend shows “Tracking started on [date]” when isBootstrap.
- **Docs**: `docs/ANALYTICS_AUDIT.md` (this file), `docs/ANALYTICS_PLATFORMS.md` (support matrix), `docs/METRIC_SNAPSHOTS_AND_HISTORY.md` (snapshot design and flows).
