# Testing Twitter and LinkedIn Only

This checklist is for testing **scheduled “email with links”** and **automation** using only Twitter and LinkedIn.

---

## 1. Email with links at scheduled time (Twitter + LinkedIn)

**What it does:** When you schedule a post and choose “Email me a link per platform”, at the scheduled time the app sends **one email** (via Resend) with a single link. Opening that link shows a page with **one button per platform** (Twitter, LinkedIn, etc.) so you can open the post on that platform, edit if needed, and publish manually.

**Already in the app:**
- Composer → **6. Schedule**: set date/time, then choose **“Email me a link per platform so I can open each one, edit or add sound, and publish manually”**.
- Email is sent from **guyk@agent4socials.com** (or the address you set in `RESEND_FROM_EMAIL`).

**What we need from you:**

| Item | Where / How |
|------|---------------------|
| **Resend API key** | Sign up at [resend.com](https://resend.com), create an API key, add to `apps/web/.env`: `RESEND_API_KEY=re_xxxx`. In Vercel: Project → Settings → Environment Variables → add `RESEND_API_KEY`. |
| **Sender email** | Default is `guyk@agent4socials.com`. If you want `guyk@agent4social.com` instead, add `RESEND_FROM_EMAIL=Agent4Socials <guyk@agent4social.com>` and verify that domain in Resend (Dashboard → Domains). |
| **CRON_SECRET** | Free – it’s just an env var. Pick a long random string (e.g. `openssl rand -hex 32`). Add it in Vercel → Settings → Environment Variables: `CRON_SECRET=your-secret`. No Vercel Pro required. |
| **Cron to trigger at scheduled time** | **Without Vercel Pro:** use a free external cron. Example: [cron-job.org](https://cron-job.org) (free). Create a job: URL `https://agent4socials.com/api/cron/process-scheduled`, schedule every 5 minutes, add request header `X-Cron-Secret` = your `CRON_SECRET` value. Same secret you set in Vercel. **With Vercel Pro:** `vercel.json` cron runs automatically; just set `CRON_SECRET` in Vercel. |

**How to test:**
1. Connect **Twitter** and **LinkedIn** in the app (Accounts).
2. In Composer, select **only Twitter and LinkedIn**, add content/media, set a **schedule** a few minutes from now, choose **“Email me a link per platform”**, then click **Schedule Post**.
3. **Trigger the cron:** Either wait for cron-job.org (1–5 min), or run now: `curl -X GET "https://agent4socials.com/api/cron/process-scheduled" -H "X-Cron-Secret: YOUR_CRON_SECRET"` (replace with your real CRON_SECRET). Response shows if email was sent (`"ok": true`).
4. When the cron runs (or after you triggered it), check the inbox for the user who created the post. Open the email and click the link, then use the Twitter and LinkedIn buttons to open the post on each platform and publish manually.

---

## 2. Automation (welcome DMs) with Twitter and LinkedIn

**What it does:** “Auto-DM when someone messages you first” (Dashboard → Automation) saves a welcome message. When someone DMs you on Twitter or LinkedIn, the app would send that message automatically. **Right now only the setting is saved;** the backend that receives new-DM events and sends the reply is not implemented yet.

**What we need from you to implement and test:**

| Platform | What’s needed |
|----------|----------------|
| **Twitter/X** | App already has `dm.read`, `dm.write`. To auto-reply we need: (1) A way to know when a new conversation starts – e.g. Twitter API v2 DM webhooks or polling. (2) Server-side code to call the DM API to send the welcome message. You’ll need to confirm your Twitter app has DM access and, if we use webhooks, a publicly reachable URL for the app. |
| **LinkedIn** | LinkedIn Messaging API (and possibly a webhook or polling) to detect new conversations and send a reply. Your LinkedIn app must have the messaging product and the right scopes. |

So to **test automation** today you can:
- Turn on “Enable welcome message” and set the message on the Automation page (it will be saved).
- Actual sending of the welcome DM on Twitter/LinkedIn will work only after we add the backend (webhooks + send-DM logic). If you want that next, say “implement welcome DM for Twitter first” (or LinkedIn) and we can outline the exact API steps and env vars.

---

## Summary: minimum to test Twitter + LinkedIn “email with links”

1. **RESEND_API_KEY** in `.env` and Vercel (and optional **RESEND_FROM_EMAIL** if you want a different sender).
2. **CRON_SECRET** in `.env` and Vercel.
3. A **cron** that hits `/api/cron/process-scheduled` every 5 minutes with `X-Cron-Secret: <CRON_SECRET>`.
4. Schedule a post with only Twitter + LinkedIn, choose “Email me a link per platform”, and wait for the email after the scheduled time.

Automation (welcome DMs) will be testable once we implement the receiver + sender for Twitter and LinkedIn; the UI and settings are already in place.
