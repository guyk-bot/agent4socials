# Facebook analytics layer: implementation report

## What was added

1. **Capability map**  
   `docs/FACEBOOK_ANALYTICS_CAPABILITY_MAP.md` describes endpoints, internal keys, UI mapping, and deprecated/invalid areas.

2. **Prisma models**  
   - `FacebookMetricDiscovery`: caches probe result per `socialAccountId` + scope + `metricName` (VALID / INVALID / DEPRECATED / UNAVAILABLE).  
   - `FacebookSyncRun`: optional rows when `FACEBOOK_LOG_SYNC_RUNS=1` for Page day insight merges.  
   - `ImportedPost.platformMetadata`: JSON for Facebook `status_type` and attachment hints.

3. **`apps/web/src/lib/facebook/`**  
   - `metric-candidates.ts`: ordered candidate lists for page-day and post-lifetime insights.  
   - `discovery.ts`: single-metric probes, TTL refresh (7 days), Graph version invalidation.  
   - `resilient-insights.ts`: merges Page day insights via **one Graph call per valid metric** (no comma-separated mega-requests).  
   - `fetchers.ts`: `fetchPageProfile`, `fetchPublishedPostsPage`, `fetchAllPublishedPostsForPage`, post insight resolution.  
   - `sync-run.ts`, `dates.ts`, `types.ts`, `index.ts`.

4. **Insights API** (`insights/route.ts`, Facebook branch)  
   Uses `fetchMergedFacebookPageDayInsights` + expanded `fetchPageProfile`. With `?extended=1`, response may include `facebookInsightsSync` (fetch summary).

5. **Posts sync** (`posts/route.ts`, Facebook)  
   Paginated `published_posts`, richer fields (reactions, comments, attachments, `status_type`), discovered post insight metrics, cap of **150** posts for live insight fetches per sync (older posts keep prior `impressions`).

## What still cannot be fetched (or is limited)

- **100+ fans** thresholds for some demographics and insights (Meta).  
- **Stories** and some ephemeral types: insights often missing.  
- **Real-time** metrics: Meta aggregates on delay.  
- **Negative feedback / integrity** metrics: included as candidates; often INVALID for small Pages.  
- **Full post insight history for all posts** in one sync: rate-limit tradeoff (cap 150 insight calls per sync).

## Risky or deprecated areas

- Any **comma-separated** `metric=` on Page insights (we avoid for ingestion).  
- **`page_engaged_users`**: deprecated; excluded from candidates.  
- **`page_impressions` / `post_impressions`**: in transition; discovery marks INVALID when Graph rejects.  
- **Graph `v18` for `/insights`**: invalid for newer metric names; use `META_GRAPH_API_VERSION` (default v22 in `meta-graph-insights.ts`).  
- **N+1 post insight calls**: mitigated by cap + discovery cache; monitor rate limits.

## Future extensions (not built in this pass)

- Dedicated EAV tables (`facebook_post_daily_metrics`, etc.) if product needs SQL reporting beyond `ImportedPost` / snapshots.  
- Cron **backfill** job with stored cursors in `FacebookSyncRun.summary`.  
- Batch Graph API (`batch` endpoint) if Meta and rate limits justify.  
- Central `facebook_metric_registry` static YAML generated from this doc.
