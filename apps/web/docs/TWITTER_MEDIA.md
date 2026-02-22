# X (Twitter) media upload

## What we do

When publishing a post with an image to X (Twitter), we:

1. Fetch the image from your stored URL (e.g. S3).
2. Upload it: we try **POST https://api.twitter.com/2/media/upload** first (v2, same Bearer token as tweets). If that fails, we fall back to **v1.1** `https://upload.twitter.com/1.1/media/upload.json` (multipart/form-data).
3. Create the tweet with the returned `media_id` via **POST https://api.twitter.com/2/tweets**.

We use the **form-data** npm package so the multipart request has the correct `Content-Type` boundary (Node’s built-in `FormData` can produce invalid boundaries and lead to 403).

Authentication is your app’s **OAuth 2.0 PKCE** access token (Bearer). X’s docs state that PKCE tokens can be used for v1.1 media upload.

## 401 Unauthorized (expired token)

X access tokens expire after 2 hours. When publish gets a 401 from X, we **automatically refresh** the token (using the stored refresh token and `TWITTER_CLIENT_ID` / `TWITTER_CLIENT_SECRET`) and retry the publish once. If refresh fails (e.g. refresh token revoked or expired), the user must reconnect the X account in **Dashboard > Accounts**.

## Pricing (pay-per-use, not tiers)

As of 2025–2026, the X API uses **pay-per-use** pricing rather than fixed tiers (Free/Basic/Pro). You pay for what you use (e.g. around $0.01 per post created or media upload). Media upload (v2 **POST /2/media/upload**) and posting with media (**POST /2/tweets** with `media_ids`) are fully supported as long as you have credits or usage billing set up in the [X Developer Console](https://developer.x.com) (or console.x.com). There is no separate "tier" that blocks media; low-volume usage stays cheap. X Premium (blue checkmark) is unrelated to API access.

## If you still get 403 or no image

- **App permissions:** In the [X Developer Portal](https://developer.x.com), your app must have **Read and write** (or Read and write and Direct message). Then **reconnect** the X account in Agent4Socials (Accounts) so the new permissions apply.
- **App in a Project:** The app must be attached to a **Project**. Keys from apps outside a project can cause 403 on some endpoints.
- **Logs:** In Vercel (or your host) logs, search for `[Twitter media upload] 403 body:` to see the response body from X (if any).
- **OAuth 1.0a for media:** The v1.1 media upload endpoint often requires **OAuth 1.0a** (signed requests). To enable image uploads:
  1. In the [X Developer Portal](https://developer.x.com), open your Project and App. Under "Keys and tokens", copy the **API Key** and **API Key Secret** (these are OAuth 1.0a consumer key/secret).
  2. In Vercel (or your host), add environment variables: `TWITTER_API_KEY` and `TWITTER_API_SECRET` (the API Key and API Key Secret), then redeploy.
  3. In Agent4Socials go to **Dashboard > Accounts**. Open the link to **enable image upload** for your connected X account (this runs a one-time OAuth 1.0a flow and stores credentials). After that, publishing with images will use OAuth 1.0a for the upload and images should attach.
- **Node deprecation:** A `url.parse()` deprecation warning in logs usually comes from a dependency (e.g. form-data/axios). It is safe to ignore; to hide it in Vercel you can set `NODE_OPTIONS=--no-deprecation` in Environment Variables (optional).
- If 403 persists after enabling OAuth 1.0a, the post is still sent as **text only** and we set `mediaSkipped: true`.
