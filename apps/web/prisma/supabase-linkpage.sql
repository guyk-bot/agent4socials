-- Run this in the Supabase SQL Editor to create the Smart Links tables.
-- Prisma uses quoted identifiers, so table names are case-sensitive ("LinkPage", "LinkItem", "User").
-- Requires: the "User" table must already exist (from your main app migrations).

-- 1. LinkPage (one per user for link-in-bio)
CREATE TABLE IF NOT EXISTS "LinkPage" (
  "id"          TEXT PRIMARY KEY,
  "userId"      TEXT NOT NULL UNIQUE,
  "slug"        TEXT NOT NULL UNIQUE,
  "title"       TEXT,
  "bio"         TEXT,
  "avatarUrl"   TEXT,
  "design"      JSONB,
  "isPublished" BOOLEAN NOT NULL DEFAULT true,
  "createdAt"   TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt"   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "LinkPage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "LinkPage_slug_idx" ON "LinkPage"("slug");

-- 2. LinkItem (links/carousel/socials/etc. on a link page)
CREATE TABLE IF NOT EXISTS "LinkItem" (
  "id"          TEXT PRIMARY KEY,
  "linkPageId"  TEXT NOT NULL,
  "type"        TEXT NOT NULL DEFAULT 'link',
  "label"       TEXT,
  "url"         TEXT,
  "icon"        TEXT,
  "order"       INTEGER NOT NULL DEFAULT 0,
  "isVisible"   BOOLEAN NOT NULL DEFAULT true,
  "createdAt"   TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt"   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "LinkItem_linkPageId_fkey" FOREIGN KEY ("linkPageId") REFERENCES "LinkPage"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "LinkItem_linkPageId_idx" ON "LinkItem"("linkPageId");

-- Optional: trigger to refresh "updatedAt" on update (Prisma usually sets this from the app)
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW."updatedAt" = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "LinkPage_updatedAt" ON "LinkPage";
CREATE TRIGGER "LinkPage_updatedAt"
  BEFORE UPDATE ON "LinkPage"
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS "LinkItem_updatedAt" ON "LinkItem";
CREATE TRIGGER "LinkItem_updatedAt"
  BEFORE UPDATE ON "LinkItem"
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
