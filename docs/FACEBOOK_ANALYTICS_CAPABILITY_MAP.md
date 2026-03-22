# Facebook analytics capability map (Agent4Socials)

This document is the source of truth for what we **attempt**, what we **cache as valid/invalid**, and what powers **which UI**. Runtime discovery fills `FacebookMetricDiscovery` in Postgres; do not assume every candidate works for every Page or Graph version.

**Graph versions**

- **REST object edges** (Page node, `published_posts`, messaging): default `v18.0` (`fbRestBaseUrl`).
- **Insights** (`/{id}/insights`): `metaGraphInsightsBaseUrl` from `META_GRAPH_API_VERSION` (default `v22.0`). Newer metric names (e.g. `page_media_view`) fail on `v18.0`.

**Scopes (typical Page token)**

`read_insights`, `pages_read_engagement`, `pages_read_user_content`, `pages_manage_posts`, `pages_messaging`, etc.

---

## 1) page_profile_data

| internal_key | raw_api_field_or_metric | endpoint | level | category | time | UI safe | fallback | deprecated | notes |
|--------------|-------------------------|----------|-------|----------|------|---------|----------|------------|-------|
| page.id | id | `GET /{page-id}` | page | identity | point | yes | — | no | |
| page.name | name | same | page | identity | point | yes | — | no | |
| page.username | username | same | page | identity | point | yes | — | no | |
| page.category | category, category_list | same | page | identity | point | yes | — | no | |
| page.about | about | same | page | identity | point | yes | — | no | |
| page.website | website | same | page | identity | point | yes | — | no | |
| page.fan_count | fan_count | same | page | audience | point | yes | — | no | Dashboard KPIs |
| page.followers_count | followers_count | same | page | audience | point | yes | prefer fan_count for Pages | no | |
| page.verification_status | verification_status | same | page | trust | point | yes | — | no | |
| page.is_published | is_published | same | page | identity | point | yes | — | no | |
| page.link | link | same | page | identity | point | yes | — | no | |

**Fetcher:** `fetchPageProfile` in `apps/web/src/lib/facebook/fetchers.ts`.  
**UI:** Insights API follower strip, Facebook overview.

---

## 2) page_summary_metrics & 3) page_timeseries_metrics

Discovered per Page; valid names stored with scope `page_insights:day`. We fetch **one metric per HTTP request** (no comma lists).

| internal_key | raw metric (candidate) | endpoint | period | UI safe | deprecated | notes |
|--------------|------------------------|----------|--------|---------|------------|-------|
| impressions_series | page_media_view | `GET /{page-id}/insights` | day | yes | replaces page_impressions | Mapped to legacy snapshot key `page_impressions` for DB continuity |
| impressions_series_legacy | page_impressions | same | day | yes | Meta sunset ~Nov 2025 | Probed; may be INVALID on new Graph |
| page_views_series | page_views_total | same | day | yes | no | |
| engagements_total_proxy | page_post_engagements | same | day | yes | no | Shown as “Engagements” KPI |
| fan_adds | page_fan_adds | same | day | yes | no | Growth reconstruction |
| fan_removes | page_fan_removes | same | day | yes | no | Often INVALID for small pages; discovery marks INVALID |
| video_views | page_video_views | same | day | partial | no | |
| … | (see `metric-candidates.ts`) | same | day | partial | varies | Probed; INVALID cached |

**Code:** `FACEBOOK_PAGE_DAY_METRIC_CANDIDATES`, `discoverPageDayMetrics`, `fetchMergedFacebookPageDayInsights`.  
**Persistence:** `AccountMetricSnapshot.insightsJson` via existing `persistInsightsSeries`.  
**UI:** Facebook analytics chart (impressions), engagements KPI, growth when adds/removes valid.

---

## 4) post_level_metrics

| internal_key | source | endpoint | level | time | UI safe | notes |
|--------------|--------|----------|-------|------|---------|-------|
| post.id | id | `published_posts` | post | point | yes | |
| post.message | message | same | post | point | yes | |
| post.created_time | created_time | same | post | point | yes | |
| post.permalink | permalink_url | same | post | point | yes | |
| post.status_type | status_type | same | post | point | yes | Reel/video hint |
| post.attachments | attachments | same | post | point | yes | Stored in `ImportedPost.platformMetadata` |
| post.reactions | reactions.summary | same | post | point | yes | |
| post.comments_count | comments.summary | same | post | point | yes | |
| post.views | post_* insights | `GET /{post-id}/insights` | post | lifetime | yes | Discovered metrics; first valid wins |

**Code:** `fetchAllPublishedPostsForPage`, `resolvePostInsightMetricsForSync`, `fetchPostLifetimeMetricTotals`.  
**UI:** Imported posts list, analytics post table.

---

## 5) video_or_reel_metrics

| internal_key | raw (candidate) | level | notes |
|--------------|-----------------|-------|-------|
| post_video_views | post_video_views, post_video_views_organic | post | Probed in post lifetime discovery |
| post_video_avg_time_watched | post_video_avg_time_watched | post | May be INVALID for non-video |

Detection: `status_type` / `attachments.media_type` → `ImportedPost.mediaType`.

---

## 6) audience_metrics

| internal_key | raw | endpoint | notes |
|--------------|-----|----------|-------|
| demographics.country | page_fans_country, page_impressions_by_country_unique | `/{page-id}/insights` lifetime | `extended=1` demographics; may require 100+ fans |
| demographics.gender_age | page_fans_gender_age | same | same |

**Code:** `fetchFacebookDemographics` (uses insights base URL v22+).  
**UI:** Extended analytics when `?extended=1`.

---

## 7) engagement_metrics

Combined: `page_post_engagements` (page day), post-level reactions/comments summaries on `published_posts`, post insight candidates (see `FACEBOOK_POST_LIFETIME_METRIC_CANDIDATES`).

---

## 8) messaging_or_inbox_metrics

| internal_key | endpoint | notes |
|--------------|----------|-------|
| conversation.id | `GET /{page-id}/conversations` | Inbox product |
| conversation.updated_time | same | Operational |

Not duplicated in this analytics layer; inbox routes remain source of truth.

---

## 9) review_or_rating_metrics

| internal_key | endpoint | notes |
|--------------|----------|-------|
| rating.recommendation_type | `GET /{page-id}/ratings` | Debug + future reviews UI |
| rating.review_text | same | |

---

## 10) content_inventory_metrics

`published_posts` pagination → `ImportedPost` rows (cap 500 per sync). Checkpointing: cursor/`paging.next` inside `fetchAllPublishedPostsForPage`.

---

## 11) unavailable_or_deprecated_metrics

| metric | status | notes |
|--------|--------|-------|
| page_engaged_users | deprecated Mar 2024 | Never request; breaks batch calls |
| page_impressions | deprecated (transition) | Replaced by `page_media_view` on newer Graph |
| post_impressions | transition | Prefer `post_media_view` when valid |
| `/{page-id}/notifications` | invalid field | Do not use |
| Many page_* metrics | varies | Marked INVALID in DB after probe |

---

## Normalized storage (implemented vs planned)

| Concept | Implementation |
|---------|----------------|
| Page daily series | `AccountMetricSnapshot` + `insightsJson` (existing) |
| Metric probe cache | `FacebookMetricDiscovery` |
| Sync observability | `FacebookSyncRun` (optional; `FACEBOOK_LOG_SYNC_RUNS=1`) |
| Post inventory + metrics | `ImportedPost` + `platformMetadata` |
| Full EAV `facebook_page_daily_metrics` rows | Not added; snapshots remain canonical to limit migration risk |

---

## UI wiring

| UI area | Data source |
|---------|-------------|
| Dashboard Facebook card | `GET /api/social/accounts/[id]/insights` |
| Facebook analytics tab | same + `?extended=1` for demographics |
| Post list / performance | `GET /api/social/accounts/[id]/posts?sync=1` |
| Accounts debug JSON | `facebook-graph-debug` route |
