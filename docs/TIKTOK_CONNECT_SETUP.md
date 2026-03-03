# TikTok connect setup

If you see **"Something went wrong"** or **"correct the following: client_key"** when connecting TikTok:

## Most common cause: app in Development (sandbox)

When your TikTok app is in **Development** mode, **only accounts added as Test Users can log in**. Other accounts get the "client_key" error even when the key is correct.

**Fix:**
1. Go to [TikTok Developer Portal](https://developers.tiktok.com) → **My Apps** → your app.
2. Open **App Permissions** (or **Manage apps** → your app) → **Test Users** (or **Sandbox**).
3. Click **Add Test User** and add the TikTok username or email of the account you want to connect (e.g. your own).
4. Save. You can add up to 10 test users.
5. Try connecting again from Agent4Socials.

After your app is approved and in **Live** mode, any TikTok account can connect (no test users needed).

---

## Other checks

1. **TikTok Developer Portal** → your app → **Basic Information**:
   - Copy **Client Key** (no extra spaces).
   - Under **Redirect URI**, add exactly: `https://agent4socials.com/api/social/oauth/tiktok/callback` (no trailing slash).

2. **Vercel (or your host) env**:
   - `TIKTOK_CLIENT_KEY` = Client Key from step 1 (sandbox key if testing).
   - `TIKTOK_CLIENT_SECRET` = Client Secret from the portal.
   - `TIKTOK_REDIRECT_URI` = `https://agent4socials.com/api/social/oauth/tiktok/callback` (must match portal exactly; used in both authorize and token exchange).

3. **Scopes**: The app requests `user.info.basic` (profile + avatar), `video.upload`, `video.publish`, and `video.list` (to sync your videos to the dashboard). For follower count in analytics, add **user.info.stats** in the TikTok Developer Portal and reconnect.
