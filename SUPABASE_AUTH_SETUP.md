# Supabase Auth Setup (Email + Google)

The app uses **Supabase Auth** for sign up and sign in (email/password and Google). The API validates the Supabase JWT and syncs users to your database.

## 1. Supabase project

Use the same Supabase project that hosts your PostgreSQL database (or create one at [supabase.com](https://supabase.com)).

## 2. Enable auth providers

In **Supabase Dashboard** → **Authentication** → **Providers**:

- **Email**: Enable “Email”. Optionally enable “Confirm email” if you want verification.
- **Google**: Enable “Google” and add your Google OAuth Client ID and Secret (from [Google Cloud Console](https://console.cloud.google.com/) → APIs & Services → Credentials).  
  - **Important:** In Google Cloud Console, the OAuth client’s **Authorized redirect URIs** must include **exactly** (no trailing slash):  
    `https://<your-project-ref>.supabase.co/auth/v1/callback`  
    You can copy this from Supabase: Authentication → Providers → Google (it’s shown there). Use the same project ref as in your Supabase URL (e.g. `abcdefghijk` in `https://abcdefghijk.supabase.co`).

## 3. Redirect URLs (Supabase) — required for “Sign in with Google”

**If you see “Internal Server Error” or land on the home page with a long `#access_token=...` URL after Google sign-in**, Supabase is redirecting to the wrong URL because the callback URL is not in the allow list.

1. Go to **Supabase Dashboard** → **Authentication** → **URL Configuration** ([auth/url-configuration](https://supabase.com/dashboard/project/_/auth/url-configuration)).
2. Under **Redirect URLs**, click **Add URL** and add **exactly** (no trailing slash):
   - **Local:** `http://localhost:3000/auth/callback`
   - **Production:** `https://agent4socials.com/auth/callback`
3. Save. The app uses `redirectTo: origin + '/auth/callback'` in code; that URL **must** be in this list or Supabase falls back to **Site URL** (often `http://localhost:3000`), so you land on `/` with the token and can get a 500 or broken flow.

## 4. Get Supabase keys

In **Project Settings** → **API**:

- **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
- **anon public** key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- **JWT Secret** (under “JWT settings”) → `SUPABASE_JWT_SECRET` (for the API only)

## 5. Environment variables (required for the app to open after sign-in)

**Web app — minimal setup (same as the example app):**

The web app runs with **only** these two variables. No `DATABASE_URL` or `SUPABASE_JWT_SECRET` is required for sign-in.

1. Vercel → your **web** project → **Settings** → **Environment Variables**.
2. Add (for **Production**, and optionally Preview/Development):
   - **`NEXT_PUBLIC_SUPABASE_URL`** = your Supabase project URL (e.g. `https://rfpvkjdqpjlmkuwncysq.supabase.co`).  
     Get it: Supabase → Project Settings → API → Project URL.
   - **`NEXT_PUBLIC_SUPABASE_ANON_KEY`** = the **anon public** key (not the service role key).  
     Get it: Supabase → Project Settings → API → Project API keys → **anon public**.
3. Redeploy the web app after adding or changing these.

**Optional (for User table sync and welcome emails):**

   - **`DATABASE_URL`** = your Supabase **pooler** connection string (port **6543**). If set, the profile API syncs users to the custom `User` table and sends a welcome email on first sign-up. Without it, sign-in still works; the `User` table stays empty and no welcome email is sent.
   - **`RESEND_API_KEY`** = your Resend API key (only used when `DATABASE_URL` is set and a new user is created).
   - **`RESEND_FROM`** or **`RESEND_FROM_EMAIL`** = sender for welcome email (e.g. `Agent4Socials <guyk@agent4socials.com>`). Verify the domain in Resend → Domains.

**Web project checklist (Vercel):** Required: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Optional: `DATABASE_URL` (pooler, port 6543), `RESEND_API_KEY`, `RESEND_FROM` or `RESEND_FROM_EMAIL`, `NEXT_PUBLIC_SITE_URL` (e.g. `https://agent4socials.com`).

If these are missing or wrong on Vercel, you’ll see **“Invalid API key”** on `/auth/callback` after Google sign-in and the app won’t open. If **NEXT_PUBLIC_API_URL** is wrong or the API is down, the dashboard may load for a long time then redirect to login.

**Separate API project (if you use `apps/api` for other features):** `SUPABASE_JWT_SECRET`, **`FRONTEND_URL`** for CORS. The web app's profile route does not use these.

## 6. Run migration

So the API can link Supabase users to your `User` table:

```bash
cd apps/api && npx prisma migrate deploy
```

After this, sign up and “Continue with Google” will work; the API will create or update a `User` row per Supabase user.

---

## Troubleshooting: "Can't reach database server" at ...:5432

If Vercel logs show **Can't reach database server at `db.xxxx.supabase.co:5432`**:

- **Cause:** You are using the **direct** connection (port **5432**). Supabase does not allow direct database connections from serverless runtimes like Vercel; the server is either unreachable or connection is refused.
- **Fix:** Use the **Transaction pooler** (port **6543**) instead.
  1. In **Supabase** go to **Project Settings** → **Database**.
  2. Under **Connection string**, select **URI** and the **Transaction** (or "Transaction pooler") tab so the URL uses port **6543** (e.g. `...@db.xxxx.supabase.co:6543/postgres`).
  3. Copy that URL, replace the password with its **URL-encoded** value (e.g. `@` → `%40`, `/` → `%2F`), no parentheses or spaces.
  4. In **Vercel** → **web** project → **Environment Variables**, set `DATABASE_URL` to this pooler URL (with **6543**, not 5432). Save and **redeploy**.

After redeploying, sign in again; the profile API should be able to connect and sync users to the User table.

---

## Troubleshooting: "Profile DB sync failed" / "The provided database string is invalid"

If Vercel logs show **PrismaClientInitializationError** or "The provided database string is invalid... check the string for any illegal characters":

- **Cause:** The **password** in `DATABASE_URL` contains characters that are special in URLs (`@`, `#`, `/`, `%`, etc.). They must be **URL-encoded** in the connection string.
- **Fix:**
  1. Open **Supabase** → **Project Settings** → **Database** and copy your **Connection string** (Transaction pooler, e.g. port 6543).
  2. In the URL, replace the **password** part with a **percent-encoded** version:
     - `@` → `%40`
     - `#` → `%23`
     - `/` → `%2F`
     - `%` → `%25`
     - `?` → `%3F`
     - `&` → `%26`
  3. Example: if your password is `Pass/word@123`, the URL segment should be `Pass%2Fword%40123` (not the raw password).
  4. In **Vercel** → **web** project → **Environment Variables**, set `DATABASE_URL` to this **full** encoded string (no extra spaces or line breaks). Save and **redeploy**.

Alternatively, in Supabase you can **reset the database password** to one that only uses letters and numbers (no `@`, `#`, `/`, `%`), then use the new connection string as-is in Vercel.

---

## Troubleshooting: User table empty in Supabase

If you sign in with Google successfully but the **User** table in Supabase Table Editor stays empty:

1. **Web app needs `DATABASE_URL`** – The profile API runs inside the **web** app (Next.js API route). It syncs users to the database only when `DATABASE_URL` is set.
   - **Locally:** In `apps/web/.env`, set `DATABASE_URL` to your Supabase connection string (same as in your root `.env` or `apps/api/.env`). If it points to `localhost`, users sync to local Postgres, not Supabase.
   - **Vercel:** In your **web** project → Settings → Environment Variables, add `DATABASE_URL` = your Supabase pooler URL.
2. **Run web app migrations** – From the project root: `cd apps/web && npx prisma migrate deploy`
3. **Redeploy** – After adding `DATABASE_URL` to Vercel, redeploy the web project.
4. **Sign in again** – After the fix, sign out and sign in with Google; the profile API will create the User row on first successful load.

**Use the pooler URL (port 6543):** In Supabase → **Project Settings** → **Database**, use the **Connection string** for **Transaction pooler** (port **6543**), not the direct connection (5432). Serverless (Vercel) can hit connection limits or timeouts on 5432; the pooler is recommended. Replace the password in that URL with its URL-encoded form and set that as `DATABASE_URL` in the **web** project.

**In-app feedback:** If sync is skipped (no `DATABASE_URL`) or fails (e.g. bad connection string), the dashboard shows an amber **banner** at the top with a short message. Use "Disconnect account" on the Account page, sign in again, and check that banner. In **Vercel** → **web** project (the one that serves your Next.js app) → **Logs**, filter for `[Profile API]` to see: "DATABASE_URL is set" vs "DATABASE_URL is not set", "Created User row for: ...", or the exact error. The profile API also sends response headers `X-Profile-Sync: ok | skipped | failed` and optionally `X-Profile-Sync-Error` so you can confirm in dev tools whether the request hit the fallback path.

**Still empty?** (1) Confirm `DATABASE_URL` is set on the **same** Vercel project that deploys the Next.js app (not only the API project). (2) Use the **Transaction pooler** URL with port **6543**. (3) Redeploy the web project after changing the variable. (4) Disconnect account, sign in again, then check Vercel Logs for `[Profile API]` to see whether sync ran or what error occurred.

---

## Troubleshooting: Redirected back to login after Google sign-in

If you sign in with Google and then land back on the login page (sometimes with an amber message about profile):

1. **Web app (Vercel)** → **`NEXT_PUBLIC_API_URL`** = your API URL (e.g. `https://api.agent4socials.com`).
2. **API (Vercel)** → **`SUPABASE_JWT_SECRET`** = Supabase JWT Secret (Supabase → Project Settings → API → JWT Settings).
3. **API (Vercel)** → **`FRONTEND_URL`** = your web app URL (e.g. `https://agent4socials.com`). The API uses this for **CORS**. If this is missing, the browser blocks the profile request and you are sent back to login.

Redeploy **both** projects after changing env vars.

---

## Troubleshooting: API 500 / "This Serverless Function has crashed"

If your API URL shows a Vercel error "This Serverless Function has crashed" or 500: (1) Ensure the **API** project has **DATABASE_URL**, **SUPABASE_JWT_SECRET**, and **REDIS_HOST** (and **REDIS_PORT** / **REDIS_PASSWORD** if needed). The API uses Redis; if Redis is missing or unreachable from Vercel, the function can crash. Use a serverless Redis (e.g. Upstash). For Upstash or any TLS Redis, set **REDIS_TLS=true** (or use a host that contains `upstash.io` so TLS is auto-enabled). (2) Vercel → API project → **Logs** or **Deployments** → **Functions** to see the real error. (3) Redeploy the API after changing env vars.

---

## Troubleshooting: “Invalid API key” on auth callback

If after Google sign-in you land on `/auth/callback` and see **“Invalid API key”**:

- The **web** app (e.g. on Vercel) is not using the correct Supabase keys.
- Fix: In **Vercel** → your **web** project → **Settings** → **Environment Variables**, set:
  - `NEXT_PUBLIC_SUPABASE_URL` = your Supabase Project URL (Supabase → Project Settings → API).
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = the **anon public** key from the same page.
- Redeploy the web app, then try “Sign in with Google” again. The app should then open (e.g. redirect to dashboard).

---

## Troubleshooting: “Error 400: redirect_uri_mismatch” (Google)

If you see this when clicking “Continue with Google”:

1. **Get the exact redirect URI**  
   In Supabase: **Authentication** → **Providers** → **Google**. Copy the “Callback URL” (or “Redirect URL”) shown there. It looks like `https://<project-ref>.supabase.co/auth/v1/callback`.

2. **Add it in Google Cloud Console**  
   Go to [Google Cloud Console](https://console.cloud.google.com/) → **APIs & Services** → **Credentials** → open the **OAuth 2.0 Client ID** you use for Supabase (the one whose Client ID/Secret are in Supabase). Under **Authorized redirect URIs**, add the URL from step 1 **exactly** (same protocol, no trailing slash, correct project ref). Save.

3. **Use the right OAuth client**  
   Supabase sign-in must use an OAuth client that has **only** the Supabase callback above (or that plus other redirect URIs you need). Do not use a client that only has `https://api.agent4socials.com/social/oauth/callback` — that’s for the API’s social linking, not for “Sign in with Google” via Supabase. You can create a separate “Web client” for Supabase if needed.

---

## Make “Sign in with Google” show your brand name (Agent4Socials)

**Why you see the Supabase domain:** Google only shows your **app name and logo** on the sign-in screen **after your app passes Brand Verification**. Until then, Google shows the redirect domain (e.g. `rfpvkjdqpjlmkuwncysq.supabase.co`). Your other app that shows the app name has **verified branding** in Google Cloud; this project needs the same.

[Google’s docs](https://support.google.com/cloud/answer/15549049): *"Your brand must be verified if you want your application logo and application name to be visible to users on the consent screen. Without verification, only your application domain will be visible to users."*

### Steps

1. **Open the right project**  
   [Google Cloud Console](https://console.cloud.google.com/) → top bar: select the project that contains the OAuth 2.0 Client ID used by Supabase (e.g. “My First Project” or the one where you created the Web client for Supabase).

2. **Go to OAuth consent screen**  
   **APIs & Services** → **OAuth consent screen** (left menu under “Google Auth Platform” or “Credentials” area).

3. **Edit Branding**  
   Open the **Branding** tab.

4. **Set the name users see**
   - **App name \*** → set to exactly **`Agent4Socials`** (capital A and S). This is the main text Google can show as “Sign in to Agent4Socials”.
   - **User support email \*** → e.g. `guyk@agent4socials.com`.
   - **App logo** → upload your Agent4Socials logo (square, recommended 120×120 px). This appears on the consent screen.

5. **App domain (optional but good for trust)**  
   - **Application home page** → `https://agent4socials.com/`  
   - **Application privacy policy link** → `https://agent4socials.com/privacy`  
   - **Application terms of service link** → `https://agent4socials.com/terms`

6. **Save**  
   Click **Save**. Changes can take a short while to appear.

7. **Set the OAuth client name (often what Google shows)**  
   **APIs & Services** → **Credentials** → open your **OAuth 2.0 Client ID** (the Web client whose Client ID is in Supabase).  
   Change **Name \*** from anything like “guy kogen” to **`Agent4Socials`**, then **Save**. In many flows Google uses this client name on the consent screen, not only the Branding app name.

After this, the consent screen should show **“Sign in to Agent4Socials”** and your logo. The line “Google will allow … to access” may still mention the Supabase domain for security; that’s normal and required for the redirect.

### Verify your brand (required for app name to show)

1. On the **Branding** page, find **Verification status** / **Brand Verification**.
2. Click **Verify Branding**. Google runs an automated check (often a few minutes).
3. If status becomes **Ready to publish**, click **Publish branding** within 7 days so the name and logo go live.
4. If you see **Need to fix issues**, open **View issues** and fix what Google asks (e.g. domain in [Google Search Console](https://search.google.com/search-console), or branding fields), then verify again.

After verification and publishing, the sign-in screen will show "to continue to Agent4Socials" (and your logo) instead of the Supabase domain. No code or deploy changes needed.

*(Previous note: Google can show the callback domain by design until brand is verified. That part is not always replaceable with your app name until you verify.)*
