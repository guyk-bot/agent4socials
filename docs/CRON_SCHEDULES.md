# External cron schedules (cron-job.org)

Send **`X-Cron-Secret: <CRON_SECRET>`** on every request (or `Authorization: Bearer <CRON_SECRET>` where the route accepts it).

Base URL: `https://<your-domain>/api/cron/...`

## Every 1 to 2 minutes (first incoming DM auto-reply)

| Path | What it does |
|------|----------------|
| `/api/cron/dm-first-welcome` | Background sweep for Instagram, Facebook, and X: sends first-incoming auto-DM when the latest inbound message is fresh (about 15 minutes). Returns **202** immediately; work runs in `after()` after a short delay (default 2.5s) so it does not collide with other crons on the same minute. |

**Stagger crons:** Do not start `dm-first-welcome`, `process-scheduled`, and `comment-automation` at the same second (e.g. all at `:00`). Offset **dm-first-welcome** by ~30s (e.g. `:01` / `:03`) or rely on the built-in `DM_FIRST_WELCOME_CRON_START_DELAY_MS` delay. Otherwise you may see `Timed out fetching a new connection from the connection pool` in Vercel logs.

**DATABASE_URL:** Use Supabase **Transaction pooler** (port **6543**) with `pgbouncer=true`, not direct port 5432 on Vercel.

## Every 5 minutes (comments automation, scheduled publishing)

**Option A (one cron job):** call **`/api/cron/fast-tick`** every **5 minutes**. Same auth header. It runs scheduled posts, then comment automation, in one request (no self-HTTP chain). If you use this, **do not** also schedule `process-scheduled` or `comment-automation` separately, or automation will run twice.

**Option B (two cron jobs):**

| Path | What it does |
|------|----------------|
| `/api/cron/process-scheduled` | Publishes due scheduled posts (up to 3 per run) and scheduled email-link sends. |
| `/api/cron/comment-automation` | Keyword comment automation (Meta, X, YouTube, etc.). |

Both every **5 minutes**. Do not rely on `PROCESS_SCHEDULED_CHAIN_COMMENT_AUTOMATION` unless you accept longer single requests and possible timeouts.

**Inbox comments** still load when users open **Inbox**. **First incoming DM** automation also needs **`/api/cron/dm-first-welcome`** every one to two minutes if you want replies without opening a thread.

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
| `/api/cron/welcome-followers` | If you use Twitter new-follower welcome DMs: every **15 to 30** minutes is enough. |
| `/api/cron/run-migrations` | Only when you intentionally run migrations from cron. |

## Tuning

- **`CRON_SYNC_HTTP_BUDGET_MS`**: wall time budget for `sync-platform-data` (see route file). Increase only if your host allows longer HTTP waits.
- **`COMMENT_AUTOMATION_CRON_BUDGET_MS`**: wall time for one comment-automation run (see `lib/comment-automation.ts`).
