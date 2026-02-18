# Agent4Socials Setup Guide

Complete guide to deploy your social media scheduling platform to production.

## Prerequisites

- [x] Domain purchased: agent4socials.com
- [x] GitHub account
- [x] Vercel account
- [x] Supabase account

## Step 1: Supabase Database Setup

### 1.1 Create a New Project

1. Go to [Supabase Dashboard](https://supabase.com/dashboard)
2. Click "New Project"
3. Fill in:
   - **Name**: agent4socials
   - **Database Password**: (create a strong password and save it)
   - **Region**: Choose closest to your users
4. Click "Create new project"

### 1.2 Get Database Connection String

1. Once created, go to **Project Settings** → **Database**
2. Scroll to **Connection String** → **URI**
3. Copy the connection string (it looks like):
   ```
   postgresql://postgres:[YOUR-PASSWORD]@db.xxx.supabase.co:5432/postgres
   ```
4. Replace `[YOUR-PASSWORD]` with your actual password

### 1.3 Enable Connection Pooler (Required for Vercel)

1. In **Project Settings** → **Database**
2. Scroll to **Connection Pooler**
3. **Enable** it
4. Copy the **Transaction** mode connection string:
   ```
   postgresql://postgres.[project-ref]:[YOUR-PASSWORD]@aws-0-[region].pooler.supabase.com:6543/postgres?pgbouncer=true
   ```

## Step 2: Redis Setup (Upstash)

For production, we need a hosted Redis service since Vercel doesn't support long-running processes.

### 2.1 Create Upstash Redis

1. Go to [Upstash Console](https://console.upstash.com/)
2. Click "Create Database"
3. Choose:
   - **Name**: agent4socials-redis
   - **Type**: Regional
   - **Region**: Same as your Supabase
4. Click "Create"

### 2.2 Get Redis Credentials

1. In your database dashboard, find:
   - **UPSTASH_REDIS_REST_URL**
   - **UPSTASH_REDIS_REST_TOKEN**
2. Save these for later

## Step 3: Object Storage Setup (Cloudflare R2)

For storing images and videos.

### 3.1 Create R2 Bucket

1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. Go to **R2** → **Create bucket**
3. Name: `agent4socials-media`
4. Region: Automatic
5. Click "Create bucket"

### 3.2 Get R2 Credentials

1. Go to **R2** → **Manage R2 API Tokens**
2. Click "Create API Token"
3. Permissions: Object Read & Write
4. Click "Create API Token"
5. Save:
   - **Access Key ID**
   - **Secret Access Key**
   - **Endpoint URL** (e.g., `https://[account-id].r2.cloudflarestorage.com`)

## Step 4: Social Media OAuth Setup

### 4.1 Instagram (Meta)

1. Go to [Meta for Developers](https://developers.facebook.com/)
2. Create a new app → **Business** type
3. Add **Instagram Basic Display** product
4. In **Basic Display** → **Settings**:
   - Add Valid OAuth Redirect URIs:
     ```
     https://api.agent4socials.com/api/social/oauth/instagram/callback
     ```
5. Save:
   - **Instagram App ID**
   - **Instagram App Secret**

### 4.2 YouTube (Google)

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create new project: "agent4socials"
3. Enable **YouTube Data API v3**
4. Go to **APIs & Services** → **Credentials**
5. Create **OAuth 2.0 Client ID**:
   - Application type: Web application
   - Authorized redirect URIs:
     ```
     https://api.agent4socials.com/api/social/oauth/youtube/callback
     ```
6. Save:
   - **Client ID**
   - **Client Secret**

### 4.3 TikTok

1. Go to [TikTok for Developers](https://developers.tiktok.com/)
2. Create new app
3. Add **Login Kit** and **Content Posting API**
4. In app settings, add redirect URI:
   ```
   https://api.agent4socials.com/api/social/oauth/tiktok/callback
   ```
5. Save:
   - **Client Key**
   - **Client Secret**

## Step 5: Deploy to Vercel

### 5.1 Push to GitHub

```bash
cd /Users/guykogen/Desktop/Agent4socials
git add .
git commit -m "Initial commit - Agent4Socials"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/agent4socials.git
git push -u origin main
```

### 5.2 Deploy Backend API

1. Go to [Vercel Dashboard](https://vercel.com/dashboard)
2. Click "Add New..." → "Project"
3. Import your GitHub repository
4. Configure:
   - **Framework Preset**: Other
   - **Root Directory**: `apps/api`
   - **Build Command**: `npm run vercel-build`
   - **Output Directory**: `dist`

5. Add Environment Variables:
   ```
   DATABASE_URL=<Your Supabase Connection Pooler URL>
   REDIS_HOST=<Your Upstash Redis REST URL>
   REDIS_PORT=6379
   JWT_SECRET=<Generate a random 64-char string>
   
   GOOGLE_CLIENT_ID=<From YouTube OAuth>
   GOOGLE_CLIENT_SECRET=<From YouTube OAuth>
   
   META_APP_ID=<From Instagram>
   META_APP_SECRET=<From Instagram>
   META_REDIRECT_URI=https://api.agent4socials.com/api/social/oauth/instagram/callback
   
   TIKTOK_CLIENT_KEY=<From TikTok>
   TIKTOK_CLIENT_SECRET=<From TikTok>
   TIKTOK_REDIRECT_URI=https://api.agent4socials.com/api/social/oauth/tiktok/callback
   
   YOUTUBE_CLIENT_ID=<Same as GOOGLE_CLIENT_ID>
   YOUTUBE_CLIENT_SECRET=<Same as GOOGLE_CLIENT_SECRET>
   YOUTUBE_REDIRECT_URI=https://api.agent4socials.com/api/social/oauth/youtube/callback
   
   S3_ENDPOINT=<Your R2 Endpoint>
   S3_ACCESS_KEY_ID=<Your R2 Access Key>
   S3_SECRET_ACCESS_KEY=<Your R2 Secret Key>
   S3_BUCKET_NAME=agent4socials-media
   S3_REGION=auto
   S3_PUBLIC_URL=<R2 bucket public URL so LinkedIn/X can load images>
   
   FRONTEND_URL=https://agent4socials.com
   BACKEND_URL=https://api.agent4socials.com
   ```

6. Click "Deploy"

### 5.3 Configure API Custom Domain

1. In your API project settings → **Domains**
2. Add: `api.agent4socials.com`
3. Follow DNS instructions

### 5.4 Deploy Frontend Web

1. In Vercel Dashboard, click "Add New..." → "Project"
2. Import same GitHub repository
3. Configure:
   - **Framework Preset**: Next.js
   - **Root Directory**: `apps/web`
   - **Build Command**: `npm run build`
   - **Output Directory**: `.next`

4. Add Environment Variables:
   ```
   NEXT_PUBLIC_API_URL=https://api.agent4socials.com
   
   # Required for Composer image/video uploads (use same R2 values as API)
   S3_ENDPOINT=<Your R2 Endpoint>
   S3_ACCESS_KEY_ID=<Your R2 Access Key>
   S3_SECRET_ACCESS_KEY=<Your R2 Secret Key>
   S3_BUCKET_NAME=agent4socials-media
   S3_REGION=auto
   S3_PUBLIC_URL=<R2 bucket public URL>
   ```

5. Click "Deploy"

### 5.5 Configure Main Domain

1. In your Web project settings → **Domains**
2. Add: `agent4socials.com` and `www.agent4socials.com`
3. Follow DNS instructions to point your domain to Vercel

## Step 6: Run Database Migrations

Run once (locally or in CI) to create tables in Supabase. The **web** app has its own Prisma and migrations:

```bash
cd apps/web
DATABASE_URL="<your-pooler-or-direct-url>" npx prisma migrate deploy
```

If you also use the NestJS API with a separate Prisma, run from `apps/api` as needed.

If you use the **connection pooler** URL in `DATABASE_URL`, Prisma may report "prepared statement already exists". In that case, run migrations with the **direct** connection URL (port 5432, user `postgres`):

```bash
DATABASE_URL="postgresql://postgres:YOUR_PASSWORD@db.PROJECT_REF.supabase.co:5432/postgres" npx prisma migrate deploy
```

Then keep the pooler URL in `.env` for running the app and for Vercel.

## Step 6b: Scheduled Posts (Cron and "Email me links")

- **Auto-publish at scheduled time:** Set up a cron (e.g. Vercel Cron) to call your app every few minutes:
  - **URL:** `GET` or `POST` `https://agent4socials.com/api/cron/process-scheduled`
  - **Header:** `X-Cron-Secret: <your-secret>` (set `CRON_SECRET` in Vercel env).
- **"Email me links" option:** When the user chooses "Email me a link per platform" and schedules a post, at the scheduled time the cron will send one email (via Resend) with a single link. The user opens it to see the post and platform-specific "Open in X" / "Open in LinkedIn" etc. to edit and publish manually. Requires `RESEND_API_KEY` and `RESEND_FROM` (or `RESEND_FROM_EMAIL`) in the web project.

## Step 7: Test Your App

1. Visit `https://agent4socials.com`
2. Sign up for an account
3. Connect your social media accounts
4. Create and schedule a test post

## Troubleshooting

### Database Connection Issues
- Ensure you're using the **Connection Pooler URL** from Supabase
- Check that connection pooler is enabled in Transaction mode

### OAuth Redirect Issues
- Verify all redirect URIs exactly match in OAuth settings
- Ensure URLs use `https://` not `http://`

### Redis Connection Issues
- For Vercel, you need Upstash Redis REST API
- Standard Redis connections don't work on serverless

### Media Upload Issues
- Check R2 CORS settings
- Verify bucket permissions
- Ensure S3_ENDPOINT doesn't include bucket name

## Next Steps

- [ ] Set up custom email (support@agent4socials.com)
- [ ] Configure monitoring (Sentry, LogRocket)
- [ ] Set up analytics (PostHog, Google Analytics)
- [ ] Add payment integration (Stripe)
- [ ] Set up automated backups

## Support

For issues, check:
- Vercel deployment logs
- Supabase logs
- Browser console errors
