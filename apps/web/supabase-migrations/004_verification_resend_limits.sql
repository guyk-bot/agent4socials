-- OTP resend: cooldown and lockout tracking (used by /api/auth/resend-verification)
ALTER TABLE public.verification_codes
  ADD COLUMN IF NOT EXISTS last_sent_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS resend_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS lockout_until timestamptz NULL;

UPDATE public.verification_codes
SET last_sent_at = created_at
WHERE last_sent_at IS NULL;
