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

**Follower count over time (growth chart)**: Same permissions (`instagram_manage_insights` or `instagram_business_manage_insights`). We first try **follows_and_unfollows** with `period=day` and breakdown `follow_type` (new followers vs unfollows per day) so each day shows the correct total including unfollows. If that returns no per-day data, we fall back to **follower_count** (new followers per day only). We normalize `end_time` to the metric date (end-of-day Pacific → subtract 1 day UTC) so values align with the correct calendar day (e.g. Feb 20 shows the count for Feb 20). Not available for accounts with fewer than 100 followers.

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
