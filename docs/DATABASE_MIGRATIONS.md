# Database migrations

## "The column contentByPlatform does not exist"

This means the production database is missing columns added by a Prisma migration. The build now runs **`prisma migrate deploy`** so the next deploy will apply any pending migrations.

**What you need:**
- **DATABASE_URL** must be set in Vercel (Settings → Environment Variables) for the **Production** environment so migrations run during build.

**If you can't redeploy yet** – run migrations once from your machine:

```bash
cd apps/web
# Use your production DATABASE_URL (from Vercel or Supabase)
DATABASE_URL="postgresql://..." npx prisma migrate deploy
```

Then redeploy the app so the code and DB stay in sync.

## LinkedIn + Twitter scheduling and "email with links"

Once the DB has the latest schema (contentByPlatform, etc.):

1. Connect **Twitter** and **LinkedIn** in the app (Dashboard → sidebar).
2. In **Composer**, select **Twitter** and **LinkedIn**, add content, set a schedule, choose **"Email me a link per platform"**, then **Schedule Post**.
3. When the cron runs at the scheduled time (or you trigger it), you get an email with a link. Open it to see buttons to post to Twitter and LinkedIn.

See **docs/TESTING_TWITTER_LINKEDIN.md** for Resend, CRON_SECRET, and cron-job.org setup.
