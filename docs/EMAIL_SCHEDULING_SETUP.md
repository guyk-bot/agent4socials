# Email Scheduling Setup ("Email me a link" option)

When you schedule a post and choose **"Email me a link per platform"**, the app sends you an email at the scheduled time with a link to open your post and publish manually to each platform.

## Why emails might not arrive

1. **CRON_SECRET not set** – The cron endpoint requires this header. Add `CRON_SECRET` to Vercel Environment Variables (use a long random string, e.g. `openssl rand -hex 32`).
2. **No cron hitting the endpoint** – Something must call `/api/cron/process-scheduled` when posts are due. Options:
   - **cron-job.org (free):** Create a job that calls `https://YOUR_DOMAIN/api/cron/process-scheduled` every 1–5 minutes with header `X-Cron-Secret: YOUR_CRON_SECRET`.
   - **Vercel Cron (Pro):** The `vercel.json` cron runs automatically but only once per day on the Hobby plan. For frequent runs, use cron-job.org.
3. **RESEND_API_KEY not set** – Add your Resend API key to Vercel. Verify your sender domain in Resend Dashboard.
4. **Scheduled time in the future** – The cron only processes posts whose `scheduledAt` has already passed.

## Quick test

After scheduling a post with "Email me a link" and setting `CRON_SECRET` and `RESEND_API_KEY`:

```bash
curl -X GET "https://YOUR_DOMAIN/api/cron/process-scheduled" \
  -H "X-Cron-Secret: YOUR_CRON_SECRET"
```

If the post is due, the response will show `"ok": true` for the email send. Check your inbox (and spam).
