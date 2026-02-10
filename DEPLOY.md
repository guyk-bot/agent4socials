# Deploy Agent4Socials to Vercel + Connect Domain

Use this guide to get **agent4socials.com** and **api.agent4socials.com** live on Vercel so you can use them for social platform app verification (Instagram, YouTube, TikTok).

---

## 1. Push your code to GitHub

If you haven’t already:

```bash
cd /Users/guykogen/Desktop/Agent4socials
git add .
git commit -m "Agent4Socials – ready for Vercel"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/agent4socials.git
git push -u origin main
```

Replace `YOUR_USERNAME` with your GitHub username. Create the repo at github.com first if needed (empty, no README).

---

## 2. Deploy the **frontend** (website) on Vercel

1. Go to [vercel.com](https://vercel.com) and sign in (with GitHub if possible).
2. Click **Add New…** → **Project**.
3. **Import** your `agent4socials` repo.
4. Configure this project **only for the web app**:
   - **Root Directory:** click **Edit**, set to `apps/web`.
   - **Framework Preset:** Next.js (should be auto-detected).
   - **Build Command:** `npm run build` (default).
   - **Output Directory:** `.next` (default).
5. **Environment Variables** – add:
   - `NEXT_PUBLIC_API_URL` = `https://api.agent4socials.com`  
     (use your real API URL once the API project is deployed; you can change this later.)
6. Click **Deploy**. Wait for the build to finish.
7. **Domain:** In the project → **Settings** → **Domains**:
   - Add `agent4socials.com`.
   - Add `www.agent4socials.com` if you want.
   - Follow Vercel’s instructions to point your DNS (A/CNAME) to Vercel.

Your live site will be at **https://agent4socials.com** (after DNS propagates).

---

## 3. Deploy the **API** (backend) on Vercel

1. In Vercel, click **Add New…** → **Project** again.
2. Import the **same** `agent4socials` repo (second project).
3. Configure for the API:
   - **Root Directory:** `apps/api`.
   - **Framework Preset:** Other.
   - **Build Command:** `npm run build` (runs `prisma generate` + `nest build`).
   - **Output Directory:** leave default (Vercel uses the serverless entry).
4. **Environment Variables** – add the same as in `apps/api/.env` (at least these):

   | Name | Value (example / note) |
   |------|------------------------|
   | `DATABASE_URL` | Your Supabase **pooler** URL (`?pgbouncer=true`) |
   | `REDIS_HOST` | Redis Cloud host |
   | `REDIS_PORT` | e.g. `11113` |
   | `REDIS_PASSWORD` | Your Redis Cloud password |
   | `JWT_SECRET` | Strong random string (e.g. 64 chars) |
   | `ENCRYPTION_KEY` | Strong random string (e.g. 32 chars) |
   | `FRONTEND_URL` | `https://agent4socials.com` |
   | `META_REDIRECT_URI` | `https://api.agent4socials.com/api/social/oauth/instagram/callback` |
   | `TIKTOK_REDIRECT_URI` | `https://api.agent4socials.com/api/social/oauth/tiktok/callback` |
   | `YOUTUBE_REDIRECT_URI` | `https://api.agent4socials.com/api/social/oauth/youtube/callback` |

   Add the rest from your `.env` (e.g. `META_APP_ID`, `META_APP_SECRET`, Google/TikTok keys when you have them).

5. Click **Deploy**.
6. **Domain:** In this project → **Settings** → **Domains**:
   - Add `api.agent4socials.com`.
   - Point DNS for `api.agent4socials.com` as Vercel instructs (usually CNAME to `cname.vercel-dns.com` or the given target).

Your API will be at **https://api.agent4socials.com** (e.g. **https://api.agent4socials.com/api/health**).

---

## 4. Point the frontend to the live API

1. In the **web** project on Vercel → **Settings** → **Environment Variables**.
2. Set **NEXT_PUBLIC_API_URL** to `https://api.agent4socials.com` (no trailing slash).
3. Redeploy the web project (Deployments → … → Redeploy) so the new value is used.

---

## 5. Use these URLs for social developer apps

When Meta, Google, or TikTok ask for URLs:

- **Site / app URL:**  
  `https://agent4socials.com`
- **OAuth redirect URIs (exact):**
  - Instagram: `https://api.agent4socials.com/api/social/oauth/instagram/callback`
  - YouTube: `https://api.agent4socials.com/api/social/oauth/youtube/callback`
  - TikTok: `https://api.agent4socials.com/api/social/oauth/tiktok/callback`

Use **https** and no trailing slash. Add these in each platform’s developer console so verification and OAuth work.

---

## 6. DNS summary (at your domain registrar)

For **agent4socials.com**:

- Either:
  - **A** record `@` → Vercel’s IP, or  
  - **CNAME** `www` → `cname.vercel-dns.com` (and optionally **CNAME** `@` if your registrar supports it).
- **CNAME** `api` → target Vercel gives for the API project (e.g. `cname.vercel-dns.com` or the project’s domain).

Vercel’s **Domains** tab in each project shows the exact records to add.

---

## Note on scheduled posts (Redis / worker)

The API on Vercel runs as serverless functions. The **BullMQ worker** that runs scheduled jobs does **not** run on Vercel. So:

- Auth, connecting accounts, creating posts, and **posting now** work.
- **Scheduled** “post at 3pm” will only run if you later run the worker somewhere else (e.g. Railway/Render) or switch to a cron-based publisher. For verification and OAuth, the setup above is enough.
