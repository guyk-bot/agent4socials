# Database migrations

## "The column contentByPlatform does not exist"

This means the production database is missing columns added by a Prisma migration. Migrations are **not** run during Vercel build (to avoid slow or stuck builds with the DB pooler). Run them from your machine when you add or change schema:

**Run migrations (fixes missing columns):**

Your current `DATABASE_URL` uses Supabase’s **pooler** (port 6543), which can hang on `migrate deploy`. Use the **direct** connection once for migrations:

1. In **apps/web/.env** set **DATABASE_DIRECT_URL** to your direct URL (port **5432**). Use the same value as `DATABASE_URL` but change `:6543` to `:5432`. (If that fails, get Session/direct URI from Supabase Dashboard → Settings → Database.)
2. From your machine:

```bash
cd apps/web
npx prisma migrate deploy
```

Prisma uses `DATABASE_DIRECT_URL` from `.env` for migrations.
3. After it finishes, try again on agent4socials.com.

## "AI Assistant not set up yet (database table missing)"

If the **AI Writing Assistant** (Dashboard → AI Assistant) shows "Couldn't load your saved context" or "Failed to save" and the error says the database table is missing, the **BrandContext** table has not been created in production. Run the same migration steps above (use the **direct** Supabase URL with port **5432**). That will create the `BrandContext` table and brand context save will work.

## LinkedIn + Twitter scheduling and "email with links"

Once the DB has the latest schema (contentByPlatform, etc.):

1. Connect **Twitter** and **LinkedIn** in the app (Dashboard → sidebar).
2. In **Composer**, select **Twitter** and **LinkedIn**, add content, set a schedule, choose **"Email me a link per platform"**, then **Schedule Post**.
3. When the cron runs at the scheduled time (or you trigger it), you get an email with a link. Open it to see buttons to post to Twitter and LinkedIn.

See **docs/TESTING_TWITTER_LINKEDIN.md** for Resend, CRON_SECRET, and cron-job.org setup.
