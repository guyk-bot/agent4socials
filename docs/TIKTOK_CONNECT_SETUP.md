# TikTok connect setup

If you see **"Something went wrong"** or **"client_key"** when connecting TikTok:

1. **TikTok Developer Portal** (developers.tiktok.com) → your app → **Basic Information**:
   - Copy **Client Key** (no spaces/slashes; if your key has a slash, create a new key or use the exact value from the portal).
   - Under **Redirect URI**, add exactly: `https://agent4socials.com/api/social/oauth/tiktok/callback` (no trailing slash).

2. **Vercel (or your host) env**:
   - `TIKTOK_CLIENT_KEY` = Client Key from step 1.
   - `TIKTOK_CLIENT_SECRET` = Client Secret from the portal.
   - `TIKTOK_REDIRECT_URI` = `https://agent4socials.com/api/social/oauth/tiktok/callback` (must match portal exactly).

3. **Scopes**: App uses `user.info.basic`, `video.upload`, `video.publish`. Ensure these are enabled for your app in the portal.

4. If the app is in **Development**, add your TikTok account as a **test user** in the portal so you can connect.
