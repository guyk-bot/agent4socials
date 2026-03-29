-- =============================================================================
-- Restore Prisma tables (User, SocialAccount, Post, etc.) in Supabase
-- Run this in Supabase Dashboard → SQL Editor if "prisma migrate deploy" fails
-- (e.g. P1017 Server closed connection). Safe to run multiple times.
-- =============================================================================

-- 1. Drop Prisma tables and enums if they exist (so we can re-create cleanly)
DROP TABLE IF EXISTS public."MediaAsset" CASCADE;
DROP TABLE IF EXISTS public."PostTarget" CASCADE;
DROP TABLE IF EXISTS public."Post" CASCADE;
DROP TABLE IF EXISTS public."SocialAccount" CASCADE;
DROP TABLE IF EXISTS public."User" CASCADE;
DROP TYPE IF EXISTS "MediaType";
DROP TYPE IF EXISTS "PostStatus";
DROP TYPE IF EXISTS "Platform";
DROP TYPE IF EXISTS "AuthProvider";

-- 2. Create enums and User table (migration 20250210000000_init_user)
CREATE TYPE "AuthProvider" AS ENUM ('LOCAL', 'GOOGLE');

CREATE TABLE public."User" (
    "id" TEXT NOT NULL,
    "supabaseId" TEXT,
    "email" TEXT NOT NULL,
    "password" TEXT,
    "name" TEXT,
    "provider" "AuthProvider" NOT NULL DEFAULT 'LOCAL',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "User_supabaseId_key" ON public."User"("supabaseId");
CREATE UNIQUE INDEX "User_email_key" ON public."User"("email");

-- 3. Create Platform enum and SocialAccount table (migration 20250211000000_add_social_accounts)
CREATE TYPE "Platform" AS ENUM ('INSTAGRAM', 'TIKTOK', 'YOUTUBE', 'FACEBOOK', 'TWITTER', 'LINKEDIN');

CREATE TABLE public."SocialAccount" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "platform" "Platform" NOT NULL,
    "username" TEXT NOT NULL,
    "platformUserId" TEXT NOT NULL,
    "profilePicture" TEXT,
    "accessToken" TEXT NOT NULL,
    "refreshToken" TEXT,
    "expiresAt" TIMESTAMP(3),
    "scopes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" TEXT NOT NULL DEFAULT 'connected',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SocialAccount_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "SocialAccount_platformUserId_key" ON public."SocialAccount"("platformUserId");
CREATE UNIQUE INDEX "SocialAccount_userId_platform_platformUserId_key" ON public."SocialAccount"("userId", "platform", "platformUserId");
ALTER TABLE public."SocialAccount" ADD CONSTRAINT "SocialAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 4. Create PostStatus, MediaType enums and Post, PostTarget, MediaAsset (migration 20250212000000_add_posts)
CREATE TYPE "PostStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'POSTING', 'POSTED', 'FAILED');
CREATE TYPE "MediaType" AS ENUM ('IMAGE', 'VIDEO');

CREATE TABLE public."Post" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT,
    "content" TEXT,
    "status" "PostStatus" NOT NULL DEFAULT 'DRAFT',
    "scheduledAt" TIMESTAMP(3),
    "postedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Post_pkey" PRIMARY KEY ("id")
);
ALTER TABLE public."Post" ADD CONSTRAINT "Post_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE public."PostTarget" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "platform" "Platform" NOT NULL,
    "socialAccountId" TEXT NOT NULL,
    "status" "PostStatus" NOT NULL DEFAULT 'SCHEDULED',
    "platformPostId" TEXT,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PostTarget_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PostTarget_postId_platform_socialAccountId_key" ON public."PostTarget"("postId", "platform", "socialAccountId");
ALTER TABLE public."PostTarget" ADD CONSTRAINT "PostTarget_postId_fkey" FOREIGN KEY ("postId") REFERENCES public."Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE public."PostTarget" ADD CONSTRAINT "PostTarget_socialAccountId_fkey" FOREIGN KEY ("socialAccountId") REFERENCES public."SocialAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE public."MediaAsset" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "type" "MediaType" NOT NULL,
    "size" INTEGER,
    "duration" DOUBLE PRECISION,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MediaAsset_pkey" PRIMARY KEY ("id")
);
ALTER TABLE public."MediaAsset" ADD CONSTRAINT "MediaAsset_postId_fkey" FOREIGN KEY ("postId") REFERENCES public."Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 5. Tell Prisma these migrations are applied (so "prisma migrate deploy" won't re-run them)
DROP TABLE IF EXISTS public._prisma_migrations CASCADE;
CREATE TABLE public._prisma_migrations (
    id VARCHAR(36) PRIMARY KEY,
    checksum VARCHAR(64) NOT NULL,
    finished_at TIMESTAMPTZ,
    migration_name VARCHAR(255) NOT NULL,
    logs TEXT,
    rolled_back_at TIMESTAMPTZ,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    applied_steps_count INTEGER NOT NULL DEFAULT 0
);
INSERT INTO public._prisma_migrations (id, checksum, finished_at, migration_name, started_at, applied_steps_count) VALUES
('1', '0', NOW(), '20250210000000_init_user', NOW(), 1),
('2', '0', NOW(), '20250211000000_add_social_accounts', NOW(), 1),
('3', '0', NOW(), '20250212000000_add_posts', NOW(), 1);
