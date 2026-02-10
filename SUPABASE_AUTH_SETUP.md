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

## 3. Redirect URLs (Supabase)

In **Authentication** → **URL Configuration** → **Redirect URLs**, add:

- `http://localhost:3000/auth/callback` (local)
- `https://agent4socials.com/auth/callback` (production)
- Optionally keep `http://localhost:3000/dashboard` and `https://agent4socials.com/dashboard` if you use them elsewhere.

## 4. Get Supabase keys

In **Project Settings** → **API**:

- **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
- **anon public** key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- **JWT Secret** (under “JWT settings”) → `SUPABASE_JWT_SECRET` (for the API only)

## 5. Environment variables

**Web app (Vercel or `.env.local`):**

- `NEXT_PUBLIC_SUPABASE_URL` = your Supabase project URL  
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` = anon public key  

**API (Vercel or `apps/api/.env`):**

- `SUPABASE_JWT_SECRET` = JWT Secret from Supabase (so the API can verify Supabase-issued tokens)

## 6. Run migration

So the API can link Supabase users to your `User` table:

```bash
cd apps/api && npx prisma migrate deploy
```

After this, sign up and “Continue with Google” will work; the API will create or update a `User` row per Supabase user.

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
