# Database migrations

## "The column contentByPlatform does not exist"

This means the production database is missing columns added by a Prisma migration. Migrations are **not** run during Vercel build (to avoid slow or stuck builds with the DB pooler). Run them from your machine when you add or change schema:

**Run migrations (fixes missing columns):**

Your current `DATABASE_URL` uses Supabase’s **pooler** (port 6543), which can hang on `migrate deploy`. Use the **direct** connection once for migrations:

1. In **Supabase Dashboard** → your project → **Settings** → **Database**.
2. Under **Connection string**, choose **URI** and pick the **Session** (direct) option, not Transaction/pooler. It should use port **5432** (e.g. `postgresql://postgres.[ref]:[YOUR-PASSWORD]@aws-0-[region].pooler.supabase.com:5432/postgres`). Copy it and replace `[YOUR-PASSWORD]` with your database password.
3. From your machine:

```bash
cd apps/web
DATABASE_URL="postgresql://postgres.xxx:password@...:5432/postgres" npx prisma migrate deploy
```

(Use the URL you copied. Port must be **5432** for migrations.)
4. After it finishes, try creating a post again on agent4socials.com.

## "AI Assistant not set up yet (database table missing)"

If the **AI Writing Assistant** (Dashboard → AI Assistant) shows "Couldn't load your saved context" or "Failed to save" and the error says the database table is missing, the **BrandContext** table has not been created in production. Run the same migration steps above (use the **direct** Supabase URL with port **5432**). That will create the `BrandContext` table and brand context save will work.

## LinkedIn + Twitter scheduling and "email with links"

Once the DB has the latest schema (contentByPlatform, etc.):

1. Connect **Twitter** and **LinkedIn** in the app (Dashboard → sidebar).
2. In **Composer**, select **Twitter** and **LinkedIn**, add content, set a schedule, choose **"Email me a link per platform"**, then **Schedule Post**.
3. When the cron runs at the scheduled time (or you trigger it), you get an email with a link. Open it to see buttons to post to Twitter and LinkedIn.

See **docs/TESTING_TWITTER_LINKEDIN.md** for Resend, CRON_SECRET, and cron-job.org setup.
