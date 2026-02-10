# Social Media OAuth Setup Guide

To allow users to connect their social accounts, you need to create "Apps" on each platform's developer portal.

**Global Redirect URI for all platforms:**
```
https://api.agent4socials.com/social/oauth/callback
```
*(Copy and paste this exactly when asked for "Redirect URI" or "Callback URL")*

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
   - **Authorized redirect URIs**: Paste the Global Redirect URI above.
   - Click **Create**.
6. **Copy these values:**
   - `GOOGLE_CLIENT_ID`
   - `GOOGLE_CLIENT_SECRET`

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
   - Toggle **"Enforce HTTPS"** to Yes.
   - **Valid OAuth Redirect URIs**: Paste the Global Redirect URI.
   - Click **Save Changes**.
7. Go to **App Settings** -> **Basic**.
8. **Copy these values:**
   - `FACEBOOK_APP_ID` (This is your Client ID)
   - `FACEBOOK_APP_SECRET` (Click "Show")

*Note: For Instagram, you technically use the Facebook App. You will need to add the "Instagram Graph API" product to this same app later for posting features.*

---

## 3. TikTok

1. Go to [TikTok for Developers](https://developers.tiktok.com/).
2. Click **My Apps** -> **Create App**.
3. Select **"TikTok API"**.
4. Fill in details (Name: "Agent4Socials", Category: "Utility/Productivity").
5. Under **Configuration** (or "Manage" -> "Redirect URI"):
   - Add the Global Redirect URI.
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
   - **Callback URI / Redirect URL**: Paste the Global Redirect URI.
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
   - Add the Global Redirect URI.
6. Go to the **Products** tab.
   - Request access to **"Share on LinkedIn"** and **"Sign In with LinkedIn"**.
7. Back in the **Auth** tab, **copy these values:**
   - `LINKEDIN_CLIENT_ID`
   - `LINKEDIN_CLIENT_SECRET`

---

## What to do next?

Once you have these keys, go to your **Vercel Dashboard** -> **agent4socials-api** -> **Settings** -> **Environment Variables**.

Add them exactly like this (Key = Value):

```
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...

FACEBOOK_APP_ID=...
FACEBOOK_APP_SECRET=...

TIKTOK_CLIENT_KEY=...
TIKTOK_CLIENT_SECRET=...

TWITTER_CLIENT_ID=...
TWITTER_CLIENT_SECRET=...

LINKEDIN_CLIENT_ID=...
LINKEDIN_CLIENT_SECRET=...
```

Then **Redeploy** your API for the changes to take effect.
