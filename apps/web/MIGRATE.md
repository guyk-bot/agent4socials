# Database migrations (CommentAutomationReply and others)

The app runs `prisma migrate deploy` on every Vercel build so the production database stays in sync.

## You only have DATABASE_URL (Supabase pooler)

If your `DATABASE_URL` uses Supabase’s **pooler** (e.g. `pooler.supabase.com:6543` and `pgbouncer=true`), Prisma needs a **direct** connection for migrations. Add **`DATABASE_DIRECT_URL`** in Vercel:

1. **Get the direct connection string from Supabase**
   - Open [Supabase Dashboard](https://supabase.com/dashboard) → your project.
   - Go to **Project Settings** (gear) → **Database**.
   - Under **Connection string**, choose **URI** (or “Direct connection”).
   - It should look like:  
     `postgresql://postgres.[PROJECT_REF]:[YOUR_PASSWORD]@aws-0-[REGION].pooler.supabase.com:5432/postgres`  
     or (older format):  
     `postgresql://postgres:[PASSWORD]@db.[PROJECT_REF].supabase.co:5432/postgres`
   - Use **port 5432** (direct), not 6543 (transaction pooler).
   - Replace `[YOUR_PASSWORD]` with your database password (same as in `DATABASE_URL`; URL-encode special characters, e.g. `@` → `%40`).

2. **Add it in Vercel**
   - Vercel → your project → **Settings** → **Environment Variables**.
   - Add a new variable:
     - **Name:** `DATABASE_DIRECT_URL`
     - **Value:** the direct connection string from step 1.
     - **Environments:** same as `DATABASE_URL` (e.g. Production, Preview).

3. **Redeploy**
   - Trigger a new deploy (e.g. push to `main` or **Redeploy** in Vercel).
   - The build will run `prisma migrate deploy` and create any missing tables (e.g. `CommentAutomationReply`).

If you don’t set `DATABASE_DIRECT_URL`, the build may fail with a Prisma error about the direct URL or migrations.
