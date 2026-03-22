# Facebook Graph audit (live JSON, March 2026)

This report is grounded in a captured debug payload for Page `418182484712331` (Agent4Socials), not in stale public docs alone.

## What the JSON proved works

| Area | Evidence |
|------|-----------|
| PAGE access token | `debug_token` 200, `type: PAGE`, `is_valid: true`, `read_insights` in scopes |
| Page node | `GET /{page-id}?fields=...` 200 (`fan_count`, `followers_count`, `category`, etc.) |
| `published_posts` | 200, `paging.cursors` + `paging.next` (next pointed at a **different** Graph version than the first request) |
| `posts` | 200, same pagination behavior |
| `conversations` | 200 with `platform=MESSENGER` |
| `ratings` | 200 |

## What the JSON proved broken or unsafe

| Call | Result | Action taken in code |
|------|--------|----------------------|
| `GET /{page-id}/insights` with **comma-separated** `metric=page_media_view,page_views_total,page_fan_adds` | 400 `(#100) The value must be a valid insights metric` | Debug route now probes **one metric per request**. Production already uses discovery + one metric per sync call (`resilient-insights.ts`). |
| `GET /{page-id}/notifications` | 400 `(#100) Tried accessing nonexisting field (notifications)` | Removed from `facebook-graph-debug`. **Never** use this field on Page. |
| Mixed Graph versions | Initial URL used v18; `paging.next` used v24 | All app requests use **`facebookGraphBaseUrl`** from `META_GRAPH_API_VERSION` (default **v22.0**). Pagination uses **`after` cursors** on our base URL only; we do **not** follow Meta’s `paging.next` for `published_posts` / `posts`. |

## Schema mapping (product vs Prisma)

| Desired logical table | Implementation |
|----------------------|----------------|
| `facebook_pages` | `FacebookPageCache` (`@@map("facebook_pages")`), `profileJson` from `/{page-id}` |
| `facebook_posts` | `ImportedPost` where `platform = FACEBOOK` |
| `facebook_conversations` | `FacebookConversationCache` (`@@map("facebook_conversations")`) |
| `facebook_reviews` | `FacebookReviewCache` (`@@map("facebook_reviews")`) |
| `facebook_page_metrics` | `AccountMetricSnapshot` (`insightsJson`, `fansCount`, etc.) |
| `facebook_metric_registry` | `FacebookMetricDiscovery` |

## Insight metrics supported in production

Exactly **which** Page day metrics work is **per-Page and per-version**: candidates are listed in `metric-candidates.ts`, validated by `discovery.ts`, and cached in `FacebookMetricDiscovery`. Invalid names never take down the whole sync.

## Still unavailable via this Graph surface

- Page **`notifications`** edge (nonexistent on Page).
- Any metric name Meta rejects for your app or Page type remains **INVALID** in the registry until Meta changes behavior.

## Env

- `META_GRAPH_API_VERSION`: optional override (e.g. `24.0` or `v24.0`). Default **v22.0** if unset.
- `FACEBOOK_LOG_SYNC_RUNS=1`: persist `FacebookSyncRun` rows for Page insight syncs.
