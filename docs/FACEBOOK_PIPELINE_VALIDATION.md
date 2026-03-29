# Facebook pipeline validation script

Runs against your **real** Postgres (`DATABASE_URL`) and the **stored Page access token** on the newest connected `SocialAccount` with `platform = FACEBOOK`.

From `apps/web` (with env vars available, same as `next dev`):

```bash
npm run validate:facebook-pipeline
```

Optional: target one account when several exist:

```bash
npx tsx scripts/facebook-pipeline-validation.ts --socialAccountId=<cuid>
```

What it does:

1. **TEST 1** – Fetches `page_views_total`, `page_follows`, `page_post_engagements` (day, last 7 days), prints each raw Graph body, normalizes to series, calls `persistFacebookPageInsightsNormalized`, reads `facebook_page_insight_daily`, runs persist twice to verify upsert dedup.
2. **TEST 2** – Uses up to 3 `ImportedPost` rows; calls `/{post-id}/insights` per discovered (or fallback) lifetime metric; merges `facebookInsights` + `__fbPipelineValidation` on `platformMetadata`.
3. **TEST 3** – Calls `/{post-id}/comments`, `/{post-id}/reactions`, and post `fields=reactions.summary…,comments.summary…`; stores a normalized sample under `platformMetadata.__fbPipelineValidation.engagement`; prints a computed aggregation (counts, reactions-by-type on the first page).

Tokens are **redacted** in logged URLs; response bodies are printed in full.
