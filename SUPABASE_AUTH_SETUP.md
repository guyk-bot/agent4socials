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

- `http://localhost:3000/dashboard` (local)
- `https://agent4socials.com/dashboard` (production)

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

## Showing “Agent4Socials” instead of the Supabase domain on Google sign-in

Google shows the **authorized callback domain** (e.g. `rfpvkjdqpjlmkuwncysq.supabase.co`) because that’s who receives the OAuth response. You **cannot** change that domain to `agent4socials.com` without breaking Supabase Auth (the redirect must go to Supabase).

To make the consent screen friendlier, set your **app name** in Google:

1. Go to [Google Cloud Console](https://console.cloud.google.com/) → **APIs & Services** → **OAuth consent screen**.
2. Set **App name** to **Agent4Socials** (and optionally add App logo, Support email, etc.).
3. Save.

After publishing (or while in Testing), the consent screen can show “Sign in to Agent4Socials” or your app name in the header; the line “Google will allow … to access” may still show the Supabase domain for security.
