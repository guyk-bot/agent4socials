# Deploy: Metric snapshots & follower history (Instagram & Facebook)

This guide explains exactly what to do after deploying the metric snapshots feature so the Growth chart has daily follower/following data for Instagram and Facebook.

---

## Step 1: Run the database migration

The migration adds `firstConnectedAt`, `connectedAt`, `disconnectedAt` to `SocialAccount` and creates the `AccountMetricSnapshot` table. **Migrations are not run automatically during Vercel build**; you must run them once from your machine (or a CI step) with a **direct** database URL.

### 1.1 Get the direct database URL

- **Supabase:** Dashboard → **Settings** → **Database**. Use the **Connection string** that uses port **5432** (direct), not 6543 (pooler).
- Your app’s `DATABASE_URL` usually points to the **pooler** (port 6543). For `prisma migrate deploy` you need the **direct** URL (port 5432), or Prisma may hang.

### 1.2 Set `DATABASE_DIRECT_URL` locally

In **`apps/web/.env`** (or in your shell for this run only), set:

```bash
DATABASE_DIRECT_URL="postgresql://USER:PASSWORD@HOST:5432/postgres?schema=public"
```

Replace `USER`, `PASSWORD`, `HOST` with your real Supabase credentials. The important part is **`:5432`** (not 6543). You can copy `DATABASE_URL` and only change the port from 6543 to 5432.

### 1.3 Run the migration

From the **repository root** (or from `apps/web`):

```bash
cd apps/web
npx prisma migrate deploy
```

You should see something like:

```
Applying migration `20260318120000_metric_snapshots_and_connection_history`
The following migration(s) have been applied:
  migrations/
    20260318120000_metric_snapshots_and_connection_history/
      migration.sql
```

If you get “Environment variable not found: DATABASE_DIRECT_URL”, add it to `apps/web/.env` as in 1.2.  
If you get connection errors, double-check the direct URL (port 5432) and that the database is reachable from your machine.

### 1.4 Optional: run again in production

If your **production** database is different from local (e.g. different Supabase project), run the same command with the **production** direct URL:

```bash
cd apps/web
DATABASE_DIRECT_URL="postgresql://..." npx prisma migrate deploy
```

Or set `DATABASE_DIRECT_URL` in Vercel (or your deploy env) and run `npx prisma migrate deploy` in a one-off deploy step / script. The app’s **runtime** can keep using `DATABASE_URL` (pooler); only migrations need the direct URL.

---

## Step 2: Set `CRON_SECRET` (if not already set)

The metric-snapshots cron endpoint is protected by the same secret as your other cron routes.

1. **Vercel:** Project → **Settings** → **Environment Variables**.
2. Add (or confirm) **`CRON_SECRET`** with a long random value, e.g.:
   ```bash
   openssl rand -hex 32
   ```
3. Apply to **Production** (and Preview if you want to test cron there).

If you already use `CRON_SECRET` for `/api/cron/process-scheduled` or other crons, **reuse that same value**; you do not need a second secret.

---

## Step 3: Call `/api/cron/metric-snapshots` once per day

This cron fetches current follower/following (and fans for Facebook) for every **connected** Instagram and Facebook account and saves one row per account per day in `AccountMetricSnapshot`. Without it, you only get a snapshot when a user connects or reconnects.

You can use either **Vercel Cron** (Vercel Pro) or an **external cron** (e.g. cron-job.org, free).

### Option A: Vercel Cron (Vercel Pro)

1. Open **`apps/web/vercel.json`**.
2. Add a `crons` array with one job for metric-snapshots. Example (run once per day at 2:00 AM UTC):

```json
{
  "framework": "nextjs",
  "buildCommand": "npm run build",
  "installCommand": "npm install",
  "env": { "NODE_OPTIONS": "--no-deprecation" },
  "crons": [
    {
      "path": "/api/cron/metric-snapshots",
      "schedule": "0 2 * * *"
    }
  ]
}
```

Schedule format is cron expression: `0 2 * * *` = every day at 02:00 UTC. Change as needed (e.g. `0 3 * * *` for 03:00 UTC).

3. Redeploy the app. Vercel will send the request to your app and automatically add the **`Authorization: Bearer <CRON_SECRET>`** header when `CRON_SECRET` is set in Environment Variables.

### Option B: External cron (e.g. cron-job.org, free)

1. Go to [cron-job.org](https://cron-job.org) (or another cron service) and create an account.
2. Create a **new cron job**:
   - **URL:** `https://YOUR_DOMAIN/api/cron/metric-snapshots`  
     (e.g. `https://agent4socials.com/api/cron/metric-snapshots`)
   - **Schedule:** Once per day (e.g. 2:00 AM in your timezone, or 02:00 UTC).
   - **Request method:** GET or POST (both work).
   - **Request headers:** Add one header:
     - **Name:** `X-Cron-Secret`  
     - **Value:** your `CRON_SECRET` (same value as in Vercel).
3. Save and enable the job.

The endpoint also accepts the secret via **query** (for quick manual tests only; avoid in production):

```bash
curl "https://YOUR_DOMAIN/api/cron/metric-snapshots?secret=YOUR_CRON_SECRET"
```

---

## Step 4: Verify

1. **Migration:** In Supabase (or your DB client), confirm:
   - Table **`AccountMetricSnapshot`** exists.
   - **`SocialAccount`** has columns **`firstConnectedAt`**, **`connectedAt`**, **`disconnectedAt`**.

2. **Cron:** After the first run (wait for the scheduled time or trigger it manually):

   ```bash
   curl -X GET "https://YOUR_DOMAIN/api/cron/metric-snapshots" \
     -H "X-Cron-Secret: YOUR_CRON_SECRET"
   ```

   Expected response shape:

   ```json
   { "ok": true, "processed": 2 }
   ```

   `processed` is the number of connected Instagram/Facebook accounts that got a snapshot. If you have no connected IG/FB accounts, `processed` can be 0 (still success).

3. **App:** Connect an Instagram or Facebook account (or use an existing one), open Dashboard → Analytics → Growth. You should see either:
   - A flat line with the message “Tracking started on [date]…” (only one snapshot so far), or
   - After the next cron run, a second data point and a real trend line as more snapshots are added.

---

## Summary checklist

- [ ] Run **`npx prisma migrate deploy`** from `apps/web` with **`DATABASE_DIRECT_URL`** set (port 5432).
- [ ] Set **`CRON_SECRET`** in Vercel (or reuse existing).
- [ ] Schedule **`/api/cron/metric-snapshots`** once per day (Vercel Cron or cron-job.org with header **`X-Cron-Secret: CRON_SECRET`**).
- [ ] (Optional) Trigger the cron once manually and check the JSON response.

After this, the Growth chart for Instagram and Facebook will use your own stored history; YouTube is unchanged and uses only platform data.
