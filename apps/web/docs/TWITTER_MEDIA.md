# X (Twitter) media upload

## What we do

When publishing a post with an image to X (Twitter), we:

1. Fetch the image from your stored URL (e.g. S3).
2. Upload it to `https://upload.twitter.com/1.1/media/upload.json` using **multipart/form-data**.
3. Create the tweet with the returned `media_id_string` via the v2 API.

We use the **form-data** npm package so the multipart request has the correct `Content-Type` boundary (Node’s built-in `FormData` can produce invalid boundaries and lead to 403).

Authentication is your app’s **OAuth 2.0 PKCE** access token (Bearer). X’s docs state that PKCE tokens can be used for v1.1 media upload.

## 401 Unauthorized (expired token)

X access tokens expire after 2 hours. When publish gets a 401 from X, we **automatically refresh** the token (using the stored refresh token and `TWITTER_CLIENT_ID` / `TWITTER_CLIENT_SECRET`) and retry the publish once. If refresh fails (e.g. refresh token revoked or expired), the user must reconnect the X account in **Dashboard > Accounts**.

## If you still get 403 or no image

- **App permissions:** In the [X Developer Portal](https://developer.x.com), your app must have **Read and write** (or Read and write and Direct message). Then **reconnect** the X account in Agent4Socials (Accounts) so the new permissions apply.
- **App in a Project:** The app must be attached to a **Project**. Keys from apps outside a project can cause 403 on some endpoints.
- **Logs:** In Vercel (or your host) logs, search for `[Twitter media upload] 403` to see the response body from X (if any). If the line shows nothing after `403`, X may have returned an empty body; try reconnecting the account and ensuring the app has Read and write.
- **Node deprecation:** A `url.parse()` deprecation warning in logs usually comes from a dependency (e.g. form-data/axios). It is safe to ignore; to hide it in Vercel you can set `NODE_OPTIONS=--no-deprecation` in Environment Variables (optional).
- If 403 persists, X may be requiring **OAuth 1.0a** for this endpoint in your app/region. Full support would require implementing OAuth 1.0a (consumer key/secret + user access token/secret) and signing the upload request; until then, the post is sent as **text only** and we set `mediaSkipped: true`.
