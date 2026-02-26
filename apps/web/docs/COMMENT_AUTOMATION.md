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
