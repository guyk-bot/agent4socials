# Google OAuth verification re-submission

Use this checklist when Google asks you to re-submit after **Error 400: redirect_uri_mismatch** or an incomplete demo video.

---

## 1. Fix redirect_uri_mismatch

The redirect URI your app sends to Google must **exactly** match a URI listed in the OAuth client.

- **Google Cloud Console**  
  - Go to [APIs & Services → Credentials](https://console.cloud.google.com/apis/credentials).  
  - Open your **OAuth 2.0 Client ID** (Web application).  
  - Under **Authorized redirect URIs**, add (no trailing slash):  
    `https://agent4socials.com/api/social/oauth/youtube/callback`  
  - If your production app uses another domain (e.g. `https://www.agent4socials.com`), use that origin and add:  
    `https://www.agent4socials.com/api/social/oauth/youtube/callback`  
  - Save.

- **Your app (e.g. Vercel)**  
  - Set **YOUTUBE_REDIRECT_URI** to the **exact same** URL (e.g. `https://agent4socials.com/api/social/oauth/youtube/callback`).  
  - Set **NEXT_PUBLIC_APP_URL** to that same origin (e.g. `https://agent4socials.com`) so the OAuth start URL uses the same base.  
  - Redeploy.

- **Verify**  
  - In production, go to Dashboard → connect YouTube. Complete the flow; you must **not** see "Error 400: redirect_uri_mismatch".

---

## 2. Record the new demo video

Record on the **same domain** you fixed (production). The video must show:

| Requirement | What to show |
|-------------|--------------|
| **End-to-end OAuth flow** | User clicks Connect YouTube → Google consent screen → user grants → redirect back to your app → YouTube connected successfully. |
| **Consent screen in English** | Before granting, set the consent screen language to **English** (toggle bottom-left). |
| **Exact scopes** | The consent screen must list the **same scopes** you requested in the verification form (e.g. `youtube.upload`, `youtube.readonly`, and any others you asked for). |
| **All OAuth entry points** | If you have more than one way to start YouTube OAuth (e.g. from Accounts page and from Composer), show each flow. |
| **Use of scopes** | After connecting, show the app using the requested APIs (e.g. publishing a video to YouTube from Composer, or viewing channel/analytics from the dashboard). |

---

## 3. Reply to Google

Reply **directly to the same email** from Google and include:

1. **Link to the new demo video** (e.g. unlisted YouTube link or shared Google Drive link).
2. **Short confirmation**, e.g.:  
   *"We have fixed the redirect_uri_mismatch by aligning YOUTUBE_REDIRECT_URI with the Authorized redirect URIs in Google Cloud Console and redeployed. The new demo video shows the full OAuth flow (including the consent screen in English), the exact scopes we request, and the app using those scopes. Please let us know if you need anything else."*

Do **not** start a new verification request; reply to the existing thread so they can continue the same case.

---

## Scopes this app uses (for reference)

- `https://www.googleapis.com/auth/youtube.readonly` – read channel/videos/comments  
- `https://www.googleapis.com/auth/youtube.upload` – upload videos  
- `https://www.googleapis.com/auth/youtube.force-ssl` – reply to comments  
- `https://www.googleapis.com/auth/yt-analytics.readonly` – analytics (if requested)

Ensure the OAuth consent screen in Google Cloud shows these same scope names (or the subset you submitted for verification).
