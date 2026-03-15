# X DM fetch results

- **Script:** `apps/web/scripts/fetch-x-dms-standalone.mjs`
- **Run:** From repo root: `cd apps/web && node scripts/fetch-x-dms-standalone.mjs`

When the request succeeds you get:
- `dms_page_1.json`, `dms_page_2.json`, … (raw API responses)
- `dms_all.json` (all events from the last ~30 days)

When it fails, `fetch_result.json` contains the status and next steps.

**To fix 401 (Unauthorized):** Regenerate **Access Token** and **Access Token Secret** in [developer.x.com](https://developer.x.com) → your app → **Keys and tokens** → Access Token and Secret → Regenerate. Update `TWITTER_ACCESS_TOKEN` and `TWITTER_ACCESS_TOKEN_SECRET` in the repo root `.env`.

**Optional – use DB token:** Add a valid `DATABASE_URL` (e.g. Supabase Postgres) to `.env`. The script will then try to use the Twitter account’s stored credentials (OAuth 1.0a from `credentialsJson` or Bearer from `accessToken`).
