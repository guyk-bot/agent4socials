-- Run this in Supabase Dashboard → SQL Editor (project rfpvkjdqpjlmkuwncysq or your project)
-- Tables for OTP verification and user profiles (no Prisma/DATABASE_URL required)

-- 1. Verification codes for email signup OTP (expire after 15 min)
CREATE TABLE IF NOT EXISTS public.verification_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  email text NOT NULL,
  code text NOT NULL,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '15 minutes'),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_verification_codes_email ON public.verification_codes(email);
CREATE INDEX IF NOT EXISTS idx_verification_codes_expires_at ON public.verification_codes(expires_at);

-- 2. User profiles (synced after verification; atomic welcome email via welcome_email_sent_at)
CREATE TABLE IF NOT EXISTS public.user_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,  -- Supabase: references auth.users
  email text NOT NULL,
  full_name text,
  tier text NOT NULL DEFAULT 'account',
  monthly_word_limit int NOT NULL DEFAULT 0,
  marketing_consent boolean NOT NULL DEFAULT false,
  welcome_email_sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_profiles_user_id ON public.user_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_profiles_email ON public.user_profiles(email);

-- RLS: allow service role full access; anon can read own profile only
ALTER TABLE public.verification_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access verification_codes" ON public.verification_codes
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access user_profiles" ON public.user_profiles
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Users can read own profile" ON public.user_profiles
  FOR SELECT USING (auth.uid() = user_id);
