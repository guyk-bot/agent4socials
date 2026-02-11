# Client Onboarding Flow (same as Sound Like Me)

This app uses the same pattern: **signup with OTP** → **verify** → **create profile** → **atomic welcome email**.

## 1. User signup (`POST /api/auth/signup`)

**Env used:** `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_APP_URL` (or `NEXT_PUBLIC_SITE_URL`), `RESEND_API_KEY`, `RESEND_FROM` or `RESEND_FROM_EMAIL`

**Process:**

- User submits email, password, full name, marketing consent.
- Server creates the user in Supabase Auth (unconfirmed) via Admin API.
- Server generates a 6-digit OTP and stores it in `verification_codes` (Supabase table).
- Server sends a **verification email** via Resend with the code.
- User enters the code on the site to verify.

## 2. Email verification (`POST /api/auth/verify-otp`)

**Env used:** `SUPABASE_SERVICE_ROLE_KEY`

**Process:**

- User submits email + 6-digit code.
- Server checks `verification_codes` (valid and not expired).
- Server marks the user as confirmed (`email_confirm: true`) via Admin API.
- Server deletes the used code.
- Client then calls `signInWithEmail(email, password)` to get a session.

## 3. Profile creation and welcome email (`GET /api/auth/profile`)

**Env used:** `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, `RESEND_FROM` or `RESEND_FROM_EMAIL`

**Process:**

- After sign-in (email or Google), the client calls `GET /api/auth/profile` with the session token.
- If **no** `DATABASE_URL` but **yes** `SUPABASE_SERVICE_ROLE_KEY`:
  - Server ensures a row exists in `user_profiles` (create if missing).
  - Server does an **atomic** “claim” of the welcome email: `UPDATE user_profiles SET welcome_email_sent_at = now() WHERE user_id = ? AND welcome_email_sent_at IS NULL RETURNING *`.
  - If that update returns a row, server sends the **welcome email** via Resend (once per user).
- Returns profile (from `user_profiles` or from Supabase Auth if no admin/key).

If you use **Prisma** (`DATABASE_URL` set), the profile API uses the existing Prisma `User` table and welcome email logic instead of `user_profiles`.

## 4. Database (Supabase tables, no Prisma required)

**Env:** `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY` for client auth; `SUPABASE_SERVICE_ROLE_KEY` for server-side admin (bypass RLS).

**Tables:** Run the SQL in **Supabase Dashboard → SQL Editor** (see `supabase-migrations/001_onboarding_tables.sql`):

- `verification_codes` – OTP storage (email, code, expires_at).
- `user_profiles` – user_id, email, full_name, tier, monthly_word_limit, marketing_consent, welcome_email_sent_at.

## 5. Email (Resend)

**Env:** `RESEND_API_KEY`, `RESEND_FROM` or `RESEND_FROM_EMAIL`

- **Verification email** – 6-digit code (signup).
- **Welcome email** – after profile is created, sent once via atomic `welcome_email_sent_at` claim.

## 6. Env variables: what to add / remove

**Add (required for this onboarding flow):**

| Variable | Where | Purpose |
|----------|--------|---------|
| `SUPABASE_SERVICE_ROLE_KEY` | Vercel (web), `apps/web/.env` | Create user, verify OTP, read/write `verification_codes` and `user_profiles` (bypass RLS). |
| `NEXT_PUBLIC_APP_URL` | Vercel (web), `apps/web/.env` | Base URL for links in emails (e.g. `https://agent4socials.com`). Fallback: `NEXT_PUBLIC_SITE_URL`. |
| `RESEND_API_KEY` | Already used | Verification + welcome emails. |
| `RESEND_FROM` or `RESEND_FROM_EMAIL` | Already used | Sender address (e.g. `Agent4Socials <guyk@agent4socials.com>`). |

**Keep (already used):**

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

**Optional (not needed for this flow):**

- `DATABASE_URL` – only needed if you use Prisma and the `User` table. For the “Sound Like Me” style flow, we use Supabase tables only (`verification_codes`, `user_profiles`), so you can **remove** `DATABASE_URL` from the web app if you don’t use Prisma elsewhere.
- `SUPABASE_JWT_SECRET` – not used by the web app’s profile/signup/verify routes (they use the Supabase client and service role). Only needed if you have a **separate** API app that verifies JWT.

**Summary – minimal web app env (same as your other app):**

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `RESEND_API_KEY`
- `RESEND_FROM` or `RESEND_FROM_EMAIL`
- `NEXT_PUBLIC_APP_URL` (or `NEXT_PUBLIC_SITE_URL`)

## 7. One-time setup

1. **Supabase:** Run `apps/web/supabase-migrations/001_onboarding_tables.sql` in the SQL Editor.
2. **Vercel (web project):** Add the variables above; remove `DATABASE_URL` from the web project if you no longer need Prisma there.
3. **Resend:** Verify the domain for your sender email so production emails deliver.

After that, signup → verify code → sign in → profile created and welcome email sent once.
