# Social Media OAuth Setup Guide

To allow users to connect their social accounts, you need to create "Apps" on each platform's developer portal.

**Base URL:** `https://agent4socials.com` (OAuth runs on the web app.)

**Redirect URIs to whitelist (add each one that you use):**

| Platform  | Redirect URI |
|-----------|----------------|
| Instagram | `https://agent4socials.com/api/social/oauth/instagram/callback` |
| Facebook  | `https://agent4socials.com/api/social/oauth/facebook/callback` |
| YouTube   | `https://agent4socials.com/api/social/oauth/youtube/callback` |
| TikTok    | `https://agent4socials.com/api/social/oauth/tiktok/callback` |
| Twitter   | `https://agent4socials.com/api/social/oauth/twitter/callback` |
| LinkedIn  | `https://agent4socials.com/api/social/oauth/linkedin/callback` |

**If you see "URL Blocked" or "redirect_uri_mismatch":** Add the exact URI from the table above to your app’s **Valid OAuth Redirect URIs** / **Authorized redirect URIs** in that platform’s developer console. No trailing slash; protocol and path must match exactly.

---

## 1. Google / YouTube

1. Go to [Google Cloud Console](https://console.cloud.google.com/).
2. Click **Create Project** -> Name it "Agent4Socials" -> Create.
3. In the search bar, type **"YouTube Data API v3"** -> Click it -> Click **Enable**.
4. Go to **APIs & Services** -> **OAuth consent screen**.
   - User Type: **External**.
   - Fill in app name ("Agent4Socials"), support email, and developer contact info.
   - Click **Save and Continue**.
   - **Scopes**: Add `.../auth/youtube.upload`, `.../auth/youtube.readonly`.
   - Add your email as a **Test User** (important while in "Testing" mode).
5. Go to **Credentials** -> **Create Credentials** -> **OAuth client ID**.
   - Application type: **Web application**.
   - Name: "Agent4Socials Web".
   - **Authorized redirect URIs**: Add `https://agent4socials.com/api/social/oauth/youtube/callback` (and any other redirects this client uses, e.g. Google Sign-In).
   - Click **Create**.
6. **Copy these values:** (use as `YOUTUBE_CLIENT_ID` / `YOUTUBE_CLIENT_SECRET` in the web app env)
   - Client ID
   - Client secret

---

## 2. Meta (Instagram & Facebook)

1. Go to [Meta for Developers](https://developers.facebook.com/).
2. Click **My Apps** -> **Create App**.
3. Select **"Other"** -> **Next**.
4. Select **"Business"** -> **Next**.
5. App Name: "Agent4Socials" -> Create App.
6. On the "Add products to your app" page:
   - Find **Facebook Login for Business** -> Click **Set Up**.
   - Go to **Settings** (under Facebook Login) on the left sidebar.
   - Turn on **Client OAuth Login** and **Web OAuth Login**.
   - Toggle **"Enforce HTTPS"** to Yes.
   - **Valid OAuth Redirect URIs**: Add **both** (one per line; use **agent4socials.com**, not api.agent4socials.com):
     - `https://agent4socials.com/api/social/oauth/instagram/callback`
     - `https://agent4socials.com/api/social/oauth/facebook/callback`
   - Add **agent4socials.com** to **App Domains** if required.
   - Click **Save Changes**.

**If you see "URL Blocked" for Facebook:** The redirect URI must be exactly `https://agent4socials.com/api/social/oauth/facebook/callback` (no trailing slash). If your app is sending a different URL (e.g. `https://api.agent4socials.com/...`), in Vercel set **FACEBOOK_REDIRECT_URI** = `https://agent4socials.com/api/social/oauth/facebook/callback` for Production, then redeploy. Also ensure **NEXT_PUBLIC_APP_URL** (and **NEXT_PUBLIC_SITE_URL** if used) is `https://agent4socials.com`, not `https://api.agent4socials.com`.
7. Go to **App Settings** -> **Basic**.
8. **Copy these values:** (use as `META_APP_ID` / `META_APP_SECRET` in the web app env)
   - App ID (Client ID)
   - App Secret (Click "Show")

*Note: Instagram uses the same Meta app; both redirect URIs above must be in Valid OAuth Redirect URIs.*

### Connect with Instagram only (no Facebook)

Users can connect **Instagram Professional accounts** (Business or Creator) **without** linking to a Facebook Page by using "Connect with Instagram only" on the Accounts page.

1. In the same Meta app (or a dedicated one), go to **Instagram** in the left sidebar.
2. Click **API setup with Instagram login** (or "API setup with Instagram business login") in the left sidebar under "Permissions and features".
3. On the main page you’ll see numbered steps. Find step **4. Set up Instagram business login** and click the blue **Set up** button.
4. On the setup screen, add **OAuth redirect URI** (or "Valid redirect URIs") exactly: `https://agent4socials.com/api/social/oauth/instagram/callback` (no trailing slash).
5. Your **Instagram App ID** and **Instagram App Secret** are shown at the top of the same Instagram setup page (step 1 area). Copy them from there.
6. In Vercel (web app), add:
   - `INSTAGRAM_APP_ID` = Instagram App ID  
   - `INSTAGRAM_APP_SECRET` = Instagram App Secret  
   - (Optional) `INSTAGRAM_REDIRECT_URI` = `https://agent4socials.com/api/social/oauth/instagram/callback` — set this if you get **"Invalid redirect_uri"** from Instagram so the app sends this exact URL.

If you use the same app for both flows, you can leave these unset and use `META_APP_ID` / `META_APP_SECRET` for "Connect with Instagram only" as well (the code falls back to META_* if INSTAGRAM_* are not set).

---

## 3. TikTok

1. Go to [TikTok for Developers](https://developers.tiktok.com/).
2. Click **My Apps** -> **Create App**.
3. Select **"TikTok API"**.
4. Fill in details (Name: "Agent4Socials", Category: "Utility/Productivity").
5. Under **Configuration** (or "Manage" -> "Redirect URI"):
   - Add `https://agent4socials.com/api/social/oauth/tiktok/callback`.
6. Under **Products** / **Permissions**:
   - You need `user.info.basic`, `video.upload`, `video.publish`.
   - Submit for review (or use "Sandbox" mode for testing).
7. **Copy these values:**
   - `TIKTOK_CLIENT_KEY` (Client ID)
   - `TIKTOK_CLIENT_SECRET`

---

## 4. Twitter (X)

1. Go to [Twitter Developer Portal](https://developer.twitter.com/en/portal/dashboard).
2. Click **Projects & Apps** -> **Add App**.
3. Name: "Agent4Socials".
4. Once created, click **"Set up"** under **User authentication settings**.
   - App permissions: **Read and Write**.
   - Type of App: **Web App, Automated App or Bot**.
   - **Callback URI / Redirect URL**: `https://agent4socials.com/api/social/oauth/twitter/callback`.
   - **Website URL**: `https://agent4socials.com`
   - Click **Save**.
5. Go to the **Keys and tokens** tab.
6. Look for **OAuth 2.0 Client ID and Client Secret**.
   - **Copy these values:**
     - `TWITTER_CLIENT_ID`
     - `TWITTER_CLIENT_SECRET`

---

## 5. LinkedIn

1. Go to [LinkedIn Developers](https://www.linkedin.com/developers/).
2. Click **Create App**.
3. Name: "Agent4Socials".
   - You will need to link it to a LinkedIn Page (you can create a dummy one if needed).
4. Go to the **Auth** tab.
5. Under **OAuth 2.0 settings**:
   - Click the pencil icon next to "Authorized redirect URLs for your app".
   - Add `https://agent4socials.com/api/social/oauth/linkedin/callback`.
6. Go to the **Products** tab.
   - Request access to **"Share on LinkedIn"** and **"Sign In with LinkedIn"**.
7. Back in the **Auth** tab, **copy these values:**
   - `LINKEDIN_CLIENT_ID`
   - `LINKEDIN_CLIENT_SECRET`

---

## What to do next?

Add the env vars to your **web app** (e.g. Vercel → **agent4socials** project → Settings → Environment Variables). Use the key names your app expects, e.g. `META_APP_ID`, `META_APP_SECRET`, `YOUTUBE_CLIENT_ID`, `YOUTUBE_CLIENT_SECRET`, `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET`, `TWITTER_CLIENT_ID`, `TWITTER_CLIENT_SECRET`, `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET`. Set `NEXT_PUBLIC_APP_URL=https://agent4socials.com` (or your production URL). Then **Redeploy** the web app.
