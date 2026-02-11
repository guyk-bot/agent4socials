-- =============================================================================
-- SINGLE "users" TABLE MIGRATION
-- Run in Supabase Dashboard → SQL Editor.
-- WARNING: This DROPS all existing public tables and creates one new "users" table.
-- Back up data before running. After this, app code must use this table (Supabase
-- client or a Prisma model for "users" only).
-- =============================================================================

-- 1. Drop existing tables (dependencies first; CASCADE removes dependent objects)
DROP TABLE IF EXISTS public."PostTarget" CASCADE;
DROP TABLE IF EXISTS public."MediaAsset" CASCADE;
DROP TABLE IF EXISTS public."AuditLog" CASCADE;
DROP TABLE IF EXISTS public."Notification" CASCADE;
DROP TABLE IF EXISTS public."Post" CASCADE;
DROP TABLE IF EXISTS public."SocialAccount" CASCADE;
DROP TABLE IF EXISTS public."Workspace" CASCADE;
DROP TABLE IF EXISTS public."User" CASCADE;
DROP TABLE IF EXISTS public._prisma_migrations CASCADE;
DROP TABLE IF EXISTS public.user_profiles CASCADE;
DROP TABLE IF EXISTS public.verification_codes CASCADE;

-- 2. Create single "users" table
-- Links to Supabase Auth via auth_user_id. One row per user; all profile,
-- account, and per-platform connection/token data in one place.
CREATE TABLE public.users (
  -- Primary key (our internal ID; use this as "User ID" for support)
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Link to Supabase Auth (required for sign-in)
  auth_user_id uuid UNIQUE NOT NULL,

  -- Profile
  email text NOT NULL,
  first_name text,
  full_name text,

  -- Account / subscription
  -- Values: trial | monthly | yearly | finish_trial | canceled_trial | cancel_monthly | cancel_yearly
  account_status text NOT NULL DEFAULT 'trial',

  -- Sign-in method: email | google
  sign_in_method text NOT NULL DEFAULT 'email',

  -- Instagram
  instagram_connected boolean NOT NULL DEFAULT false,
  instagram_username text,
  instagram_platform_user_id text,
  instagram_access_token text,
  instagram_refresh_token text,
  instagram_expires_at timestamptz,
  instagram_profile_picture text,

  -- Facebook
  facebook_connected boolean NOT NULL DEFAULT false,
  facebook_username text,
  facebook_platform_user_id text,
  facebook_access_token text,
  facebook_refresh_token text,
  facebook_expires_at timestamptz,
  facebook_profile_picture text,

  -- YouTube
  youtube_connected boolean NOT NULL DEFAULT false,
  youtube_username text,
  youtube_platform_user_id text,
  youtube_access_token text,
  youtube_refresh_token text,
  youtube_expires_at timestamptz,
  youtube_profile_picture text,

  -- TikTok
  tiktok_connected boolean NOT NULL DEFAULT false,
  tiktok_username text,
  tiktok_platform_user_id text,
  tiktok_access_token text,
  tiktok_refresh_token text,
  tiktok_expires_at timestamptz,
  tiktok_profile_picture text,

  -- Twitter (X)
  twitter_connected boolean NOT NULL DEFAULT false,
  twitter_username text,
  twitter_platform_user_id text,
  twitter_access_token text,
  twitter_refresh_token text,
  twitter_expires_at timestamptz,
  twitter_profile_picture text,

  -- LinkedIn
  linkedin_connected boolean NOT NULL DEFAULT false,
  linkedin_username text,
  linkedin_platform_user_id text,
  linkedin_access_token text,
  linkedin_refresh_token text,
  linkedin_expires_at timestamptz,
  linkedin_profile_picture text,

  -- Storage (GB used)
  gb_used numeric(10,2) NOT NULL DEFAULT 0,

  -- Onboarding / email
  welcome_email_sent_at timestamptz,

  -- Scheduled posts stored as JSONB (array of post objects) so one table suffices
  posts jsonb NOT NULL DEFAULT '[]'::jsonb,

  -- Timestamps
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes for common lookups
CREATE UNIQUE INDEX idx_users_auth_user_id ON public.users(auth_user_id);
CREATE INDEX idx_users_email ON public.users(email);
CREATE INDEX idx_users_created_at ON public.users(created_at);

-- Optional: trigger to keep updated_at in sync
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER users_updated_at
  BEFORE UPDATE ON public.users
  FOR EACH ROW
  EXECUTE PROCEDURE public.set_updated_at();

-- RLS (recommended)
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access users"
  ON public.users FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY "Users can read own row"
  ON public.users FOR SELECT
  USING (auth.uid() = auth_user_id);

-- 3. Re-create verification_codes for OTP signup (required for email signup flow)
CREATE TABLE public.verification_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  email text NOT NULL,
  code text NOT NULL,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '15 minutes'),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_verification_codes_email ON public.verification_codes(email);
CREATE INDEX idx_verification_codes_expires_at ON public.verification_codes(expires_at);
ALTER TABLE public.verification_codes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access verification_codes" ON public.verification_codes
  FOR ALL USING (auth.role() = 'service_role');

-- =============================================================================
-- NOTES FOR APP INTEGRATION
-- - Use auth_user_id = auth.uid() to find the current user's row.
-- - Profile API / social OAuth callbacks must read/write public.users instead of
--   User + SocialAccount (e.g. update instagram_connected, instagram_access_token, etc.).
-- - Posts: store in users.posts JSONB; each element can be
--   { id, content, media[], targets[], status, scheduledAt, postedAt, createdAt }.
-- - "User ID" for support: use public.users.id (UUID).
-- =============================================================================
