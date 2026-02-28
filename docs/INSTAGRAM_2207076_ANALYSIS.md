# Instagram Error 2207076: Root Cause Analysis

Error **2207076** means Meta's servers tried to fetch your media URL and **failed to get a valid image/video**. It is almost never a permission issue when you've reconnected an admin account.

---

## How our publish flow works

1. **Media URL in DB**: When you upload, we store something like `https://pub-xxx.r2.dev/uploads/uuid-filename.jpg` (R2) or a similar S3-style URL.
2. **publicMediaUrlForMeta()**: Before sending to Instagram, we convert that URL into a URL **Meta can fetch**:
   - If `MEDIA_SERVE_SECRET` or `CRON_SECRET` is set: `https://agent4socials.com/api/media/serve?t=TOKEN` (short, token contains the real URL)
   - Else if `S3_PUBLIC_URL` is set: `https://agent4socials.com/api/media/proxy?url=ENCODED_URL` (long)
   - Else: raw URL (e.g. `https://pub-xxx.r2.dev/...`) is sent as-is
3. **Instagram API**: We POST `image_url` or `video_url` to Meta. Meta's servers then **GET that URL** to download the media.
4. **2207076**: Meta got 4xx/5xx, timeout, wrong Content-Type, or couldn't process the file.

---

## Most likely causes (in order)

### 1. Media URL returns error when fetched (403, 404, 502, 503)

**What happens**: We send `https://agent4socials.com/api/media/serve?t=...` or `/api/media/proxy?url=...`. When Meta fetches it:

- **Serve route** requires `S3_PUBLIC_URL` and `MEDIA_SERVE_SECRET`/`CRON_SECRET`. If either is missing in Vercel, we return 400/503.
- **Serve/proxy** check that the target URL (R2) matches `S3_PUBLIC_URL` origin. Mismatch → 403 Forbidden.
- **Serve/proxy** fetch from R2; if R2 returns 404 (e.g. wrong path) or 403 (private bucket), we forward that → Meta gets error → 2207076.
- **Raw R2 URL**: If we send the raw URL and the R2 bucket is not public, Meta gets 403/404.

**Fix**: Ensure in Vercel:

- `S3_PUBLIC_URL` = your R2 public URL (e.g. `https://pub-xxx.r2.dev`) with no trailing slash
- `CRON_SECRET` or `MEDIA_SERVE_SECRET` = any secret string (so serve tokens work)
- `NEXT_PUBLIC_APP_URL` = `https://agent4socials.com`

Verify the R2 bucket is set to **Public** so files are reachable without auth.

### 2. appBase is wrong (wrong domain in the URL)

`appBase` comes from `NEXT_PUBLIC_APP_URL` or `VERCEL_URL`. If it ends up as a preview URL (e.g. `https://agent4socials-xxx.vercel.app`) or a different domain, Meta might get:

- 404 (wrong domain)
- Redirect (Vercel preview → production)
- Timeout if the preview deployment is asleep

**Fix**: Set `NEXT_PUBLIC_APP_URL=https://agent4socials.com` for Production in Vercel.

### 3. Video-specific: URL-based upload is unreliable

For **Reels/videos**, Meta recommends **Resumable Uploads** (upload bytes to Meta) instead of `video_url`. Many 2207076 errors on video come from Meta failing to fetch or process the video URL.

**Fix**: We should add resumable upload for videos (fetch from our storage, stream to `rupload.facebook.com`). Images usually work with `image_url`.

### 4. Image size or format

- Over **8MB** → Meta rejects
- Unusual formats or corrupted files → Meta may fail

**Fix**: Validate size/format before upload; prefer JPEG/PNG for images.

### 5. Token/secret not set

If `MEDIA_SERVE_SECRET` and `CRON_SECRET` are both missing:

- `createMediaServeToken()` returns `null`
- We use proxy (if `S3_PUBLIC_URL` is set) or raw URL
- Proxy URL can be very long; some proxies or Meta might truncate long URLs

**Fix**: Set `CRON_SECRET` (you likely have it for cron) or `MEDIA_SERVE_SECRET` so serve tokens are used.

---

## Quick checklist

| Check | Where | Value |
|-------|-------|-------|
| S3_PUBLIC_URL | Vercel → Env Vars | `https://pub-xxx.r2.dev` (your R2 public URL, no trailing slash) |
| CRON_SECRET or MEDIA_SERVE_SECRET | Vercel → Env Vars | Any secret string |
| NEXT_PUBLIC_APP_URL | Vercel → Env Vars (Production) | `https://agent4socials.com` |
| R2 bucket access | Cloudflare R2 dashboard | Public read enabled |
| Image size | Composer | Under 8MB |

---

## How to test the media URL

1. Open a failing post in **Post History** → **Open in Composer**.
2. In DevTools → Network, trigger **Publish** and inspect the request to `/api/posts/[id]/publish`.
3. Or add temporary logging in the publish route to log the final `firstImageUrl` / `firstMediaUrl` we send to Meta.

Then in a new incognito tab (no auth cookies), visit that URL. You should get the image/video, not JSON error or 403/404/503.

If you get an error, that’s what Meta sees → 2207076.

---

## Code flow reference

- `apps/web/src/app/api/posts/[id]/publish/route.ts` – `publicMediaUrlForMeta()`, URL selection
- `apps/web/src/app/api/media/serve/route.ts` – token-based serve
- `apps/web/src/app/api/media/proxy/route.ts` – proxy for R2 URLs
- `apps/web/src/lib/publish-target.ts` – Instagram `media` + `media_publish` calls
- `apps/web/src/lib/media-serve-token.ts` – token creation (needs MEDIA_SERVE_SECRET or CRON_SECRET)
