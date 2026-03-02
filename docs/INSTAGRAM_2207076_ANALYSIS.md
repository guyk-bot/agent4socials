# Instagram Error 2207076: Root Cause Analysis

Error **2207076** means Meta's servers tried to fetch your media URL and **failed to get a valid image/video**. It is almost never a permission issue when you've reconnected an admin account.

**"Request processing failed" / ProcessingFailedError:** Same root cause as above: Meta's servers could not successfully fetch or process your media URL (e.g. during Reel resumable upload). Fixes below (public URL, format, size) apply. For Reels also ensure 9:16 aspect ratio, 15–90 seconds, MP4.

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

- **403 "Restricted by robots.txt"**: Often caused by Vercel's Bot Protection/WAF blocking Meta's crawler, not by robots.txt itself. **Fix**: For videos and thumbnails already on R2, we now send the **direct R2 URL** (e.g. `https://pub-xxx.r2.dev/uploads/...`) so Meta fetches from r2.dev, bypassing our domain.

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

### 4. Range header → 206 Partial Content (fixed)

**What happens**: Meta's servers may send a `Range` header when fetching the image. If we forward it to R2, R2 returns `206 Partial Content` with only part of the file. Meta receives a partial/corrupt image → 2207076.

**Fix (implemented)**: The serve and proxy routes **do not forward** the `Range` header. They always fetch the full file from R2 and return `200 OK` with the complete image. This applies to both `/api/media/serve` and `/api/media/proxy`.

### 5. Image format (Meta requires JPEG only) – fixed

Meta's official Image Specifications: **Format: JPEG** only. PNG, WebP, and GIF are not supported for feed images.

**Fix (implemented)**: When publishing to Instagram, we try two approaches in order:
1. **Direct R2 JPEG** (preferred): Fetch image from R2, convert to JPEG, upload as `uploads/ig-{uuid}.jpg`, send that direct URL to Meta. No proxy, no query params, ASCII-only URL. Most reliable.
2. **Proxy/serve fallback**: If R2 upload fails or source isn't under our R2, we use `/api/media/serve` or `/api/media/proxy` with `&format=jpeg`. We also:
   - Detect format by magic bytes when Content-Type is wrong (e.g. `application/octet-stream`)
   - Resize images over 8MB down to fit within Meta's limit
   - Support carousels (2–10 images) with each item converted to JPEG

### 6. Image size or format

- Over **8MB** → Meta rejects
- Aspect ratio: 4:5 to 1.91:1
- Unusual formats or corrupted files → Meta may fail

**Fix**: Keep under 8MB. Use aspect ratio 4:5 to 1.91:1 (e.g. 1080×1080 or 1080×1350).

### 7. Token/secret not set

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

### Verify Range fix (200 not 206)

```bash
cd apps/web && npm run test:instagram-media -- "https://agent4socials.com/api/media/proxy?url=YOUR_ENCODED_R2_URL"
```

Get the proxy URL from Post History: open a post with an image, right-click image → Copy image address. The script sends a Range header (like Meta) and checks we return **200** (not 206).

---

## Code flow reference

- `apps/web/src/app/api/posts/[id]/publish/route.ts` – `publicMediaUrlForMeta()`, URL selection
- `apps/web/src/app/api/media/serve/route.ts` – token-based serve
- `apps/web/src/app/api/media/proxy/route.ts` – proxy for R2 URLs
- `apps/web/src/lib/publish-target.ts` – Instagram `media` + `media_publish` calls
- `apps/web/src/lib/media-serve-token.ts` – token creation (needs MEDIA_SERVE_SECRET or CRON_SECRET)

**Still failing?** See [INSTAGRAM_DEBUG_GUIDE.md](./INSTAGRAM_DEBUG_GUIDE.md) for how to capture debug info and send a screenshot.
