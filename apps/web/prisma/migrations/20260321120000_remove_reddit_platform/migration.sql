-- Remove Reddit: delete Reddit-linked rows, strip REDDIT from post targetPlatforms, drop PostTarget.options, rebuild Platform enum without REDDIT.

DELETE FROM "SocialAccount" WHERE platform::text = 'REDDIT';

DELETE FROM "PendingConnection" WHERE platform = 'REDDIT';

UPDATE "Post" SET "targetPlatforms" = array_remove("targetPlatforms", 'REDDIT');

ALTER TABLE "PostTarget" DROP COLUMN IF EXISTS "options";

ALTER TABLE "SocialAccount" ALTER COLUMN "platform" TYPE text USING "platform"::text;
ALTER TABLE "AccountMetricSnapshot" ALTER COLUMN "platform" TYPE text USING "platform"::text;
ALTER TABLE "ImportedPost" ALTER COLUMN "platform" TYPE text USING "platform"::text;
ALTER TABLE "PostTarget" ALTER COLUMN "platform" TYPE text USING "platform"::text;

DROP TYPE "Platform";

CREATE TYPE "Platform" AS ENUM ('INSTAGRAM', 'TIKTOK', 'YOUTUBE', 'FACEBOOK', 'TWITTER', 'LINKEDIN');

ALTER TABLE "SocialAccount" ALTER COLUMN "platform" TYPE "Platform" USING "platform"::"Platform";
ALTER TABLE "AccountMetricSnapshot" ALTER COLUMN "platform" TYPE "Platform" USING "platform"::"Platform";
ALTER TABLE "ImportedPost" ALTER COLUMN "platform" TYPE "Platform" USING "platform"::"Platform";
ALTER TABLE "PostTarget" ALTER COLUMN "platform" TYPE "Platform" USING "platform"::"Platform";
