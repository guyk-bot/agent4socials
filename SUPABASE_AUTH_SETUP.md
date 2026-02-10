# Supabase Auth Setup (Email + Google)

The app uses **Supabase Auth** for sign up and sign in (email/password and Google). The API validates the Supabase JWT and syncs users to your database.

## 1. Supabase project

Use the same Supabase project that hosts your PostgreSQL database (or create one at [supabase.com](https://supabase.com)).

## 2. Enable auth providers

In **Supabase Dashboard** → **Authentication** → **Providers**:

- **Email**: Enable “Email”. Optionally enable “Confirm email” if you want verification.
- **Google**: Enable “Google” and add your Google OAuth Client ID and Secret (from [Google Cloud Console](https://console.cloud.google.com/) → APIs & Services → Credentials).  
  - Authorized redirect URI for Google: `https://<your-project-ref>.supabase.co/auth/v1/callback` (Supabase shows this in the Google provider settings).

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
