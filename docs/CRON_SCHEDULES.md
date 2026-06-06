# External cron schedules (cron-job.org)

Send **`X-Cron-Secret: <CRON_SECRET>`** on every request (or `Authorization: Bearer <CRON_SECRET>` where the route accepts it).

Base URL: `https://<your-domain>/api/cron/...`

**Unauthorized in the browser:** Opening a cron URL without the secret (e.g. pasting the link in Chrome) always returns `401 Unauthorized`. That is correct. Configure the secret only in cron-job.org as a request header, not in the public URL.

**cron-job.org test run shows "timeout":** `sync-inbox` and `sync-platform-data` return **HTTP 202** immediately and finish work in the background. If the test UI says "Failed (timeout)" but the HTTP status was **202**, the job was accepted and may still complete. Check Vercel logs for `sync-inbox done` or `sync-platform-data done`.

**Automation crons removed from live app:** Comment automation, first-incoming welcome DMs, and follower welcome were archived under `archive/automation/`. Disable any external jobs pointing at `/api/cron/comment-automation`, `/api/cron/dm-first-welcome`, or `/api/cron/welcome-followers`.

## Every 5 minutes (scheduled publishing)

**Option A (one cron job):** call **`/api/cron/fast-tick`** every **5 minutes**. Same auth header. It runs due scheduled posts in one request. If you use this, **do not** also schedule `process-scheduled` separately.

**Option B (dedicated job):**

| Path | What it does |
|------|----------------|
| `/api/cron/process-scheduled` | Publishes due scheduled posts (up to 3 per run) and scheduled email-link sends. |

Every **5 minutes**.

**Inbox comments and DMs** load when users open **Inbox** (live API + cached threads).

## Every 30 minutes (posts in DB, metrics, lower Meta app usage)

| Path | What it does |
|------|----------------|
| `/api/cron/sync-platform-data` | Account overview, imported posts, post metrics for all connected accounts. |
| `/api/cron/sync-inbox` | Pre-warms Instagram and Facebook DM threads into the DB so Inbox opens messages instantly. **Use GET or POST** (cron-job.org defaults to GET). |
| `/api/cron/sync-linkedin` | LinkedIn member metrics and post rollup (only if you use LinkedIn). |

If you currently call `sync-platform-data` every **15** minutes, moving it to **30** minutes cuts roughly half of those Meta-heavy syncs while keeping analytics and post lists reasonably fresh.

## Daily

| Path | What it does |
|------|----------------|
| `/api/cron/metric-snapshots` | Daily follower or fan snapshots (Instagram + Facebook). |

## Optional

| Path | When |
|------|------|
| `/api/cron/run-migrations` | Only when you intentionally run migrations from cron. |

## Tuning

- **`CRON_SYNC_HTTP_BUDGET_MS`**: wall time budget for `sync-platform-data` (see route file). Increase only if your host allows longer HTTP waits.
