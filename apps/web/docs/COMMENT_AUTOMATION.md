# Keyword comment automation

## How it works

- You enable **keyword comment automation** in the Composer (section 4: keywords + reply text) and publish the post to Facebook, Instagram, X, etc.

## When does it run?

- **Vercel Crons** (default): the job runs **once per day** (e.g. 10:00 UTC). Keyword replies can take up to ~24 hours.
- **Faster replies**: In **Dashboard → Automation** click **"Run comment automation now"** to run it immediately. For replies within minutes, add an external cron (e.g. cron-job.org) that calls `POST /api/cron/comment-automation` every 5 minutes with header `X-Cron-Secret: YOUR_CRON_SECRET`.
- A **cron job** runs on a schedule (see below). It finds comments on those posts and, if the comment text contains one of your keywords, posts your auto-reply **once per comment**.
- We never reply to our own account’s comments (e.g. if you comment from @agent4socials on your own post, we skip it).

## Why you might not see an auto-reply

1. **You posted a new tweet instead of replying**  
   The automation only runs on **replies** to the post. Posting a separate tweet that says “demo” does not trigger it. You must **reply** to the post (open the post, click “Reply”, type the keyword).

2. **Cron hasn’t run yet**  
   On Vercel the job runs once per day. Use "Run comment automation now" in Dashboard → Automation to run it right after someone comments.

3. **X Search API access**  
   For X, we use the Search API to find replies. If your X app or plan doesn’t allow that (e.g. no access to `tweets/search/recent`), the automation will not find replies. Check the cron response or logs for errors.

4. **CRON_SECRET**  
   The cron endpoint requires the `X-Cron-Secret` header (or `Authorization: Bearer CRON_SECRET`). In Vercel, Crons send this automatically if you set `CRON_SECRET` in Environment Variables.

## High-volume accounts (optional Vercel env)

Each cron run is bounded so serverless jobs finish and platforms are not hammered. Defaults are sane for most users; raise values only if you have Pro-level function time and still respect Meta/X rate limits.

| Variable | Default | Meaning |
|----------|---------|---------|
| `COMMENT_AUTOMATION_MAX_POSTS` | `40` | Max posted rows with automation processed per run (most recently updated first). |
| `COMMENT_AUTOMATION_MAX_META_COMMENT_PAGES` | `25` | Max Graph API pages per IG/FB post (~50 comments/page). |
| `COMMENT_AUTOMATION_MAX_REPLIES_PER_TARGET` | `40` | Stop sending replies for one `PostTarget` after this many successes in one run (next cron continues). |
| `COMMENT_AUTOMATION_MAX_TWITTER_PAGES` | `8` | Max X `search/recent` pagination tokens per post (`max_results` 100 per page). |
| `COMMENT_AUTOMATION_INTER_PAGE_DELAY_MS` | `120` | Pause between Meta/X pagination requests. |
| `COMMENT_AUTOMATION_INTER_REPLY_DELAY_MS` | `150` | Pause after each successful reply (rate limit friendliness). |

**Heavy traffic:** call `/api/cron/comment-automation` **more often** (e.g. every 2–5 minutes) instead of relying only on the daily job. `process-scheduled` also triggers automation once per run; its `maxDuration` is aligned so that chain can complete.
