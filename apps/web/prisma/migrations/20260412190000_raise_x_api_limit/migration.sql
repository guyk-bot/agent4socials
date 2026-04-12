-- Raise the X API call limit from 100 → 10 000 per calendar month.
-- 100 was too low: each insights page load uses ~19 individual API calls
-- (1 user lookup + up to 18 timeline pages), exhausting the budget after ~5 loads.
-- Also reset counters so accounts that already hit the old cap can load again immediately.
ALTER TABLE "SocialAccount"
  ALTER COLUMN "xApiSyncLimit" SET DEFAULT 10000;

UPDATE "SocialAccount"
SET
  "xApiSyncLimit" = 10000,
  "xApiCallCount" = 0,
  "xApiUsageMonthKey" = NULL
WHERE platform = 'TWITTER';
