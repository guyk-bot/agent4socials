# Analytics support matrix by platform

Official APIs only. No scraping.

---

## Instagram

| Item | Detail |
|------|--------|
| **Endpoint** | `GET https://graph.facebook.com/v18.0/{ig-user-id}/insights` |
| **Permissions** | `instagram_manage_insights` or `instagram_business_manage_insights` |
| **Account type** | Business or Creator |
| **Retention** | 28 days time-series; demographics: last_14/30/90_days |
| **Aggregation** | Aggregated; demographics top 45 |

**Metrics**: impressions (deprecated), reach, profile_views, accounts_engaged, **follower_demographics**, **engaged_audience_demographics** (breakdowns: age, city, country, gender), views, saves, likes, shares.

**Follower count over time (growth chart)** – two sources:

1. **Our own history (primary for connected accounts):** From first connection we store daily snapshots in `AccountMetricSnapshot`. The Growth chart uses this when we have ≥2 snapshots; otherwise we show a flat bootstrap line from connection date with current values. History is preserved across disconnect/reconnect. See **docs/METRIC_SNAPSHOTS_AND_HISTORY.md**.
2. **API fallback (when building series from API):** Same permissions. We try **follows_and_unfollows** with `period=day` and breakdown `follow_type`; if no per-day data, we use **follower_count** (new followers per day). We normalize `end_time` to metric date (end-of-day Pacific → subtract 1 day UTC). Not available for accounts with fewer than 100 followers.

---

## Facebook (Page)

| Item | Detail |
|------|--------|
| **Endpoint** | `GET https://graph.facebook.com/v18.0/{page-id}/insights` |
| **Permissions** | `read_insights`, `pages_read_engagement` |
| **Account type** | Page (100+ likes) |
| **Retention** | Max 90 days per request; 2 years total |
| **Aggregation** | Aggregated; demographics if 100+ people |

**Metrics**: page_impressions, page_views_total, page_engaged_users, page_fan_adds, **page_fans_gender_age**, **page_fans_country**. Some deprecated June 2026.

**Follower/fans count over time (growth chart):** We use **our own snapshot history** (same as Instagram): daily snapshots in `AccountMetricSnapshot` from first connection; chart shows real series when ≥2 snapshots, else flat bootstrap line from connection date. See **docs/METRIC_SNAPSHOTS_AND_HISTORY.md**.

---

## YouTube

| Item | Detail |
|------|--------|
| **Endpoints** | `youtube/v3/channels`, `youtubeanalytics.googleapis.com/v2/reports` |
| **Permissions** | `youtube.readonly`, `yt-analytics.readonly` |
| **Account type** | Any channel |
| **Retention** | Custom date range |
| **Aggregation** | Aggregated |

**Dimensions**: day, **country**, **ageGroup**, **gender**, **insightTrafficSourceType**. **Metrics**: views, estimatedMinutesWatched, averageViewDuration, subscribersGained, subscribersLost.

**Note:** We do **not** apply custom follower-history tracking to YouTube. The Growth chart uses only platform/API data (e.g. subscribers from the API). No `AccountMetricSnapshot` or bootstrap logic for YouTube.

---

## TikTok

| Item | Detail |
|------|--------|
| **Endpoint** | `GET https://open.tiktokapis.com/v2/user/info/`, video list |
| **Permissions** | `user.info.basic`, `user.info.stats`, `video.list` |
| **Account type** | Any |
| **Retention** | Snapshot only |
| **Aggregation** | Account + per-video |

**Available**: follower_count, video_count, likes_count, per-video views/likes/comments. **Not available**: demographics, geography, traffic source (no official API).

---

## Twitter (X)

| Item | Detail |
|------|--------|
| **Endpoints** | `2/users/{id}`, `2/users/{id}/tweets` |
| **Permissions** | `tweet.read`, `users.read` |
| **Account type** | Any |
| **Retention** | No historical time-series API |
| **Aggregation** | Per-tweet |

**Available**: followers_count, tweet_count, per-tweet like/reply/retweet/impression_count. **Not available**: audience demographics, account-level historical impressions.

---

## LinkedIn

| Item | Detail |
|------|--------|
| **Endpoint** | `v2/networkSizes/urn:li:person:{id}` (limited) |
| **Permissions** | `w_member_social`; analytics need Marketing API |
| **Account type** | Personal or Page |
| **Retention** | N/A |
| **Aggregation** | firstDegreeSize only |

**Available**: firstDegreeSize (connections). **Not available**: post analytics, demographics (Marketing API approval required).
