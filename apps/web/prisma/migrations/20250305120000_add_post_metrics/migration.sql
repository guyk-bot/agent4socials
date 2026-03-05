-- This migration is intentionally empty.
-- The likeCount/commentsCount/sharesCount columns were removed from the Prisma schema
-- to avoid breaking queries when the migration hasn't run yet.
-- These metrics are now computed and returned in the API response without DB storage.
SELECT 1;
