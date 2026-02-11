# Using the Web App as the Only API (Single Deployment)

You can run **only the web app** on Vercel and have it act as both the frontend and the API, like your other app.

## How it works

- **Leave `NEXT_PUBLIC_API_URL` unset** on the web project. The client then calls **same-origin** `/api/...` (e.g. `/api/social/accounts`, `/api/auth/profile`).
- All API logic lives in **Next.js API routes** under `apps/web/src/app/api/`.

## What’s included in the web app

- **Auth:** `/api/auth/signup`, `/api/auth/verify-otp`, `/api/auth/profile`, `/api/create-profile` (Supabase + optional Prisma).
- **Social (OAuth):** `/api/social/accounts`, `/api/social/oauth/[platform]/start`, `/api/social/oauth/[platform]/callback` (require `DATABASE_URL` and Prisma `User` + `SocialAccount`).

## Env vars on the **web** project (single app)

Set these on the **web** project in Vercel so the same app handles both UI and API:

| Variable | Purpose |
|----------|---------|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Auth (required). |
| `SUPABASE_SERVICE_ROLE_KEY` | Signup, verify OTP, user_profiles (required for that flow). |
| `RESEND_API_KEY`, `RESEND_FROM_EMAIL` | Verification + welcome email. |
| `NEXT_PUBLIC_APP_URL` | Base URL for emails and OAuth redirects. |
| **`DATABASE_URL`** | **Required for social (OAuth).** Prisma uses it for `User` and `SocialAccount`. Use Supabase pooler (port 6543). |
| **Social / OAuth** (for Connect accounts): | |
| `META_APP_ID`, `META_APP_SECRET`, `META_REDIRECT_URI` | Instagram (and optionally Facebook). |
| `FACEBOOK_REDIRECT_URI` | Facebook. |
| `YOUTUBE_CLIENT_ID`, `YOUTUBE_CLIENT_SECRET`, `YOUTUBE_REDIRECT_URI` | YouTube. |
| `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET`, `TIKTOK_REDIRECT_URI` | TikTok. |
| `TWITTER_CLIENT_ID`, `TWITTER_CLIENT_SECRET`, `TWITTER_REDIRECT_URI` | X/Twitter. |
| `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET`, `LINKEDIN_REDIRECT_URI` | LinkedIn. |

**OAuth redirect URIs when using only the web app:**  
Point them to the **web** app, not the old API URL, e.g.:

- `https://agent4socials.com/api/social/oauth/instagram/callback`
- `https://agent4socials.com/api/social/oauth/youtube/callback`
- etc.

Set the same in each platform’s dev console (Meta, Google, TikTok, etc.) and in your env (e.g. `META_REDIRECT_URI`, `YOUTUBE_REDIRECT_URI`).

## Database and migrations

- **Supabase tables (no Prisma):** Run `apps/web/supabase-migrations/001_onboarding_tables.sql` in the Supabase SQL Editor (`verification_codes`, `user_profiles`).
- **Prisma (for social + optional User sync):** Run `apps/web/prisma/migrations` against the same DB (e.g. Supabase):
  - `cd apps/web && npx prisma migrate deploy`
  - Uses `User` and `SocialAccount` (and the migration `20250211000000_add_social_accounts`).

If you already ran the **API** app’s migrations on the same database, the `User` / `SocialAccount` / `Platform` might already exist. You can skip the web migration or run it and ignore “already exists” errors as needed.

## Summary

1. Use **one** Vercel project (the web app).
2. Do **not** set `NEXT_PUBLIC_API_URL` so the client uses same-origin `/api`.
3. Set **DATABASE_URL** and the social/OAuth env vars above on that project.
4. Set OAuth redirect URIs to `https://yourdomain.com/api/social/oauth/{platform}/callback`.
5. Run Supabase SQL and Prisma migrations as above.

You can then retire the separate API deployment and run everything from the web app.
