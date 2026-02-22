# Database migrations (CommentAutomationReply and others)

The app runs `prisma migrate deploy` on every Vercel build so the production database stays in sync.

## You only have DATABASE_URL (Supabase pooler)

If your `DATABASE_URL` uses Supabase's **transaction pooler** (e.g. `pooler.supabase.com:6543`), Prisma needs a **session-mode** connection for migrations. Add **`DATABASE_DIRECT_URL`** in Vercel.

**Important:** The host `db.[ref].supabase.co:5432` is often **not reachable** from Vercel (P1001). Use the **Session mode pooler** instead: **same host as your pooler**, but **port 5432** (not 6543).

1. **Build the Session mode URL**
   - Take your existing `DATABASE_URL` (e.g. `...@aws-1-ap-northeast-2.pooler.supabase.com:6543/postgres?sslmode=require&pgbouncer=true`).
   - Change **only the port** from **6543** to **5432**, and remove `&pgbouncer=true` if present.
   - Example: `postgresql://postgres.XXX:[PASSWORD]@aws-1-ap-northeast-2.pooler.supabase.com:5432/postgres?sslmode=require`
   - URL-encode the password (e.g. `@` → `%40`, `/` → `%2F`).

2. **Add it in Vercel**
   - Vercel → your project → **Settings** → **Environment Variables**.
   - Set **`DATABASE_DIRECT_URL`** to the Session mode URL from step 1.
   - Same environments as `DATABASE_URL` (e.g. Production, Preview).

3. **Redeploy**
   - Trigger a new deploy. The build will run `prisma migrate deploy` and create any missing tables (e.g. `CommentAutomationReply`).

If you don't set `DATABASE_DIRECT_URL`, the build may fail with a Prisma error about the direct URL or migrations.

### If you get "Tenant or user not found" on port 5432

Use the **exact same** username and password as in `DATABASE_URL`. In Vercel, copy the value of `DATABASE_URL`, then:

- Change the port from **6543** to **5432**.
- Remove `&pgbouncer=true` from the query string.
- Save as `DATABASE_DIRECT_URL` (no other changes).

If it still fails, Session mode may not be available for your project. You can create the missing table once by hand:

1. Open **Supabase Dashboard** → your project → **SQL Editor**.
2. Run the following SQL (creates `CommentAutomationReply`):

```sql
CREATE TABLE IF NOT EXISTS "CommentAutomationReply" (
    "id" TEXT NOT NULL,
    "postTargetId" TEXT NOT NULL,
    "platformCommentId" TEXT NOT NULL,
    "repliedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CommentAutomationReply_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "CommentAutomationReply_postTargetId_platformCommentId_key" ON "CommentAutomationReply"("postTargetId", "platformCommentId");
CREATE INDEX IF NOT EXISTS "CommentAutomationReply_postTargetId_idx" ON "CommentAutomationReply"("postTargetId");
ALTER TABLE "CommentAutomationReply" DROP CONSTRAINT IF EXISTS "CommentAutomationReply_postTargetId_fkey";
ALTER TABLE "CommentAutomationReply" ADD CONSTRAINT "CommentAutomationReply_postTargetId_fkey" FOREIGN KEY ("postTargetId") REFERENCES "PostTarget"("id") ON DELETE CASCADE ON UPDATE CASCADE;
```

3. After that, comment automation (and the build) will work even if `prisma migrate deploy` doesn't run in Vercel.

### If you get "The column SocialAccount.credentialsJson does not exist"

The app expects a `credentialsJson` column and a `PendingTwitterOAuth1` table (for X/Twitter OAuth 1.0a media upload). If migrations didn't run, add them manually:

1. Open **Supabase Dashboard** → your project → **SQL Editor**.
2. Run:

```sql
ALTER TABLE "SocialAccount" ADD COLUMN IF NOT EXISTS "credentialsJson" JSONB;

CREATE TABLE IF NOT EXISTS "PendingTwitterOAuth1" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "requestToken" TEXT NOT NULL,
    "requestTokenSecret" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PendingTwitterOAuth1_pkey" PRIMARY KEY ("id")
);
```

3. Save. After that, publish and "Enable image upload" for X will work.
