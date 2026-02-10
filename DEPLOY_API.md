# Deploy the API to Vercel (api.agent4socials.com)

Follow these steps to get your backend live so the website can use it in production.

---

## 1. Create a new Vercel project for the API

1. Go to [vercel.com](https://vercel.com) → **Add New** → **Project**.
2. **Import** the same Git repository: `guyk-bot/agent4socials`.
3. **Configure the project:**
   - **Project Name:** e.g. `agent4socials-api`.
   - **Root Directory:** Click **Edit**, set to **`apps/api`** (not the repo root).
   - **Framework Preset:** Other (or leave as detected).
   - **Build Command:** `npm run vercel-build`  
     (This runs `prisma generate`, `prisma migrate deploy`, and `nest build`.)
   - **Output Directory:** Leave empty (the API uses `vercel.json` to point to `dist/vercel-entry.js`).
   - **Install Command:** `npm install` (default).

4. **Do not deploy yet.** Click **Environment Variables** (or **Add Environment Variables**) and add the variables from the list below. Add them for **Production** (and optionally Preview if you want).

---

## 2. Environment variables to set in Vercel

Copy these from your local `apps/api/.env` (use your real values, not placeholders). For production, replace any `localhost` URLs with your live URLs.

| Variable | Example / notes |
|----------|------------------|
| `DATABASE_URL` | Your Supabase **pooler** URL (with `?pgbouncer=true`). Same as in local `.env`. |
| `REDIS_HOST` | Redis Cloud host (e.g. `redis-xxxxx.c340.ap-northeast-2-1.ec2.cloud.redislabs.com`) |
| `REDIS_PORT` | e.g. `11113` |
| `REDIS_PASSWORD` | Your Redis Cloud password |
| `JWT_SECRET` | Strong random string (same as or stronger than local) |
| `ENCRYPTION_KEY` | 32-character secret (for encrypting tokens) |
| `FRONTEND_URL` | `https://agent4socials.com` (so CORS allows your frontend) |
| `GOOGLE_CLIENT_ID` | For Google OAuth (login / YouTube) – optional at first |
| `GOOGLE_CLIENT_SECRET` | |
| `META_APP_ID` | For Instagram / Facebook – optional at first |
| `META_APP_SECRET` | |
| `META_REDIRECT_URI` | `https://api.agent4socials.com/api/social/oauth/instagram/callback` |
| `TIKTOK_CLIENT_KEY` | Optional at first |
| `TIKTOK_CLIENT_SECRET` | |
| `TIKTOK_REDIRECT_URI` | `https://api.agent4socials.com/api/social/oauth/tiktok/callback` |
| `YOUTUBE_CLIENT_ID` | Optional at first |
| `YOUTUBE_CLIENT_SECRET` | |
| `YOUTUBE_REDIRECT_URI` | `https://api.agent4socials.com/api/social/oauth/youtube/callback` |
| `FACEBOOK_REDIRECT_URI` | `https://api.agent4socials.com/api/social/oauth/facebook/callback` |
| `TWITTER_CLIENT_ID` | Optional at first |
| `TWITTER_CLIENT_SECRET` | |
| `TWITTER_REDIRECT_URI` | `https://api.agent4socials.com/api/social/oauth/twitter/callback` |
| `LINKEDIN_CLIENT_ID` | Optional at first |
| `LINKEDIN_CLIENT_SECRET` | |
| `LINKEDIN_REDIRECT_URI` | `https://api.agent4socials.com/api/social/oauth/linkedin/callback` |
| `S3_ENDPOINT` | Optional until you add file uploads (S3/R2) |
| `S3_ACCESS_KEY_ID` | |
| `S3_SECRET_ACCESS_KEY` | |
| `S3_BUCKET_NAME` | |
| `S3_REGION` | |

**Minimum to get the API running:**  
`DATABASE_URL`, `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD`, `JWT_SECRET`, `ENCRYPTION_KEY`, `FRONTEND_URL`.  
You can add OAuth and S3 variables later.

---

## 3. Deploy

1. Click **Deploy**.
2. Wait for the build. If it fails, check the build logs:
   - **Prisma migrate:** If you see errors about “prepared statement” or migrations, your `DATABASE_URL` may be using the pooler. For **migrations**, Supabase recommends a **direct** connection (port 5432, no pooler). You can add a second variable `DATABASE_DIRECT_URL` and change the build to use it only for `prisma migrate deploy` (optional; can be done later).
   - **Nest build:** Should produce `dist/vercel-entry.js`. If not, the build command may be wrong or the root directory may not be `apps/api`.

---

## 4. Add custom domain (api.agent4socials.com)

1. In the Vercel project, go to **Settings** → **Domains**.
2. Add **`api.agent4socials.com`**.
3. Vercel will show DNS instructions. In your domain registrar (where you manage agent4socials.com):
   - Add a **CNAME** record: **api** → **cname.vercel-dns.com** (or the value Vercel shows).
4. Wait for DNS to propagate (a few minutes to an hour). Vercel will show a checkmark when it’s valid.

---

## 5. Point the frontend to the API

1. Open the **web** (frontend) project in Vercel: **agent4socials** (or whatever the main site project is named).
2. Go to **Settings** → **Environment Variables**.
3. Add or update:
   - **Name:** `NEXT_PUBLIC_API_URL`
   - **Value:** `https://api.agent4socials.com`
   - **Environment:** Production (and Preview if you want).
4. **Redeploy** the web project so the new value is used (e.g. **Deployments** → … on latest → **Redeploy**).

---

## 6. Check that the API works

- Open: **https://api.agent4socials.com/api/health**  
  You should get a success response (e.g. `{"status":"ok"}` or similar).
- From the live site **https://agent4socials.com**, try **Sign up** or **Log in**. If the frontend is using `NEXT_PUBLIC_API_URL` correctly, requests will go to the deployed API.

---

## Troubleshooting

| Problem | What to try |
|--------|--------------|
| Build fails on `prisma migrate deploy` | Use a **direct** Supabase URL (port 5432) for migrations, or run migrations once from your machine with that URL and remove `prisma migrate deploy` from the build. |
| 404 on `/api/health` or all routes | (1) Try the default deployment URL first: open the deployment in Vercel, copy the **Visit** URL (e.g. `https://agent4socials-api-xxx.vercel.app`), then try `https://that-url.vercel.app/api/health` and `https://that-url.vercel.app/`. (2) Confirm **Root Directory** is `apps/api` and **Build Command** is `npm run vercel-build`. (3) In the project, go to **Settings → Functions** and check that a function from `dist/vercel-entry.js` is listed. (4) Redeploy after any config change. |
| CORS errors from the frontend | Set `FRONTEND_URL` to `https://agent4socials.com` (no trailing slash) in the API project. |
| “Cannot find module” in build | Ensure **Root Directory** is exactly `apps/api` so `npm install` and the build run inside the API app. |

Once this is done, the next steps are: configuring OAuth apps (Meta, Google, TikTok, etc.) with the production callback URLs above, then adding Stripe and optional S3/R2.
