-- AlterTable
ALTER TABLE "Post" ADD COLUMN "targetPlatforms" TEXT[] DEFAULT ARRAY[]::TEXT[];
