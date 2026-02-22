# Keyword comment automation

## How it works

- You enable **keyword comment automation** in the Composer (section 4: keywords + reply text) and publish the post to X (or other platforms).
- A **cron job** runs every **10 minutes** (Vercel Cron: `/api/cron/comment-automation`). It finds replies/comments on those posts and, if the comment text contains one of your keywords, posts your auto-reply **once per comment**.
- We never reply to our own account’s comments (e.g. if you comment from @agent4socials on your own post, we skip it).

## Why you might not see an auto-reply

1. **You posted a new tweet instead of replying**  
   The automation only runs on **replies** to the post. Posting a separate tweet that says “demo” does not trigger it. You must **reply** to the post (open the post, click “Reply”, type the keyword).

2. **Cron hasn’t run yet**  
   The job runs every 10 minutes. After you reply, wait up to about 10 minutes and check again.

3. **X Search API access**  
   For X, we use the Search API to find replies. If your X app or plan doesn’t allow that (e.g. no access to `tweets/search/recent`), the automation will not find replies. Check the cron response or logs for errors.

4. **CRON_SECRET**  
   The cron endpoint requires the `X-Cron-Secret` header (or `Authorization: Bearer CRON_SECRET`). In Vercel, Crons send this automatically if you set `CRON_SECRET` in Environment Variables.
