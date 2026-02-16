# Social Media OAuth Setup Guide

To allow users to connect their social accounts, you need to create "Apps" on each platform's developer portal.

**Base URL:** `https://agent4socials.com` (OAuth runs on the web app.)

**Can I connect my personal TikTok and YouTube without the app being approved?**  
Yes. **YouTube:** Keep the OAuth consent screen in **Testing** and add your Google account as a **Test user** (OAuth consent screen → Test users). Only test users can connect; no verification or publishing needed. **TikTok:** Use **Sandbox** mode for your app and add your TikTok account as a sandbox tester; you can connect and test without full app review.

**Redirect URIs to whitelist (add each one that you use):**

| Platform  | Redirect URI |
|-----------|----------------|
| Instagram | `https://agent4socials.com/api/social/oauth/instagram/callback` |
| Facebook  | `https://agent4socials.com/api/social/oauth/facebook/callback` |
| YouTube   | `https://agent4socials.com/api/social/oauth/youtube/callback` |
| TikTok    | `https://agent4socials.com/api/social/oauth/tiktok/callback` |
| Twitter   | `https://agent4socials.com/api/social/oauth/twitter/callback` |
| LinkedIn  | `https://agent4socials.com/api/social/oauth/linkedin/callback` |
| Threads   | `https://agent4socials.com/api/social/oauth/threads/callback` |
| Bluesky   | `https://agent4socials.com/api/social/oauth/bluesky/callback` |

**If you see "URL Blocked" or "redirect_uri_mismatch":** Add the exact URI from the table above to your app’s **Valid OAuth Redirect URIs** / **Authorized redirect URIs** in that platform’s developer console. No trailing slash; protocol and path must match exactly.

**Facebook/Instagram: Why analytics, posts, and inbox show no data**  
The app needs the **Page** access token (not the user token) for insights, posts, and inbox. We store it in the **SocialAccount** table in the **accessToken** column (there is no separate "page token" column). If you connected before we stored the Page token, **reconnect once**: use **Reconnect** in the left sidebar for Facebook (and Instagram if you use "Connect with Facebook"), complete the flow, and when asked **choose your Page**. After that, analytics, posts, and inbox will show data like in Metricool.

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
   - **Authorized redirect URIs**: Add `https://agent4socials.com/api/social/oauth/youtube/callback` (no trailing slash). If you test locally, also add `http://localhost:3000/api/social/oauth/youtube/callback` (use your dev port).
   - Click **Create**.
6. **Copy these values:** (use as `YOUTUBE_CLIENT_ID` / `YOUTUBE_CLIENT_SECRET` in the web app env)
   - Client ID
   - Client secret

**If you get "Error 400: redirect_uri_mismatch":** The redirect URI the app sends must match Google exactly. In **Vercel** (or your host) set **YOUTUBE_REDIRECT_URI** = `https://agent4socials.com/api/social/oauth/youtube/callback` (no trailing slash). Ensure this exact URL is in Google Cloud **Authorized redirect URIs**. Then redeploy. If your site is on a different domain (e.g. a Vercel preview URL), add that full callback URL in Google and set `YOUTUBE_REDIRECT_URI` to that same URL.

**Publishing and "Google hasn't verified this app":**

- **Verification Center** (Google Cloud → **APIs & Services** → **OAuth consent screen** → **Verification Center** or **Google Auth Platform** → **Verification Center**) shows **Branding** (verified) and **Data access** status. If it says "Verification is not required" for data access, you don't need to submit for app verification.
- **To allow anyone to connect (no warning):** In **OAuth consent screen**, set **Publishing status** to **Production**. If your app only uses non‑restricted scopes, that may be enough. If Google still shows the unverified warning, add **Test users** (same OAuth consent screen) for now so those accounts can connect, or submit for verification (see below).
- **To submit the app for verification** (so all users can connect without the warning when you use sensitive/restricted scopes): In **OAuth consent screen** complete all required fields (app name, logo, home page, privacy policy URL, terms of service if required). Then open **Verification Center** → follow **Submit for verification** (or **Prepare for verification**) and provide the requested info (e.g. demo video, scope justification). After Google approves, the "unverified app" screen stops for normal users.

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

**Can I upload/post with the current Meta scopes?**  
- **Instagram:** Yes. The app requests **instagram_content_publish** when you connect (via “Connect with Facebook” and choose a Page with a linked Instagram). In **Development** mode, you and any test users can connect and post without app review. For **Live** mode, submit the **instagram_content_publish** permission (and any others you use) for App Review so all users can post.  
- **Facebook Page:** Posting to a Page’s feed requires **pages_manage_posts**. The app now requests it. If you see **Invalid Scopes: pages_manage_posts**, add that permission in [Meta for Developers](https://developers.facebook.com/) under your app → **App Review** → **Permissions and features** (or **Use cases** → **Customize** → Facebook Login), then reconnect Facebook. Until the permission is added (and approved if the app is Live), Facebook Page posts from the Composer will fail with a permission error.

**If you see "Invalid Scopes: pages_manage_posts":** Add **pages_manage_posts** in the Meta app (App Review → Permissions and features, or Use cases → Facebook Login). Then reconnect Facebook so the new token includes it.

**read_insights (Facebook Page analytics):** The app requests **read_insights** so the dashboard can show Page analytics (impressions, page views, reach). Add it in [Meta for Developers](https://developers.facebook.com/) → your app → **App Review** → **Permissions and features** → **Add to App Review** for `read_insights`. Once the permission is added (and approved if the app is Live), reconnect Facebook so the token includes it. If you see **Invalid Scopes: read_insights**, add the permission to your app first, then try connecting again.

**If you see "Invalid Scopes: pages_messaging":** The app does not request `pages_messaging` by default. For **inbox** (Page/Instagram DMs), add it in your Meta app under Products → Facebook Login → Permissions if needed; we can add it to the OAuth scope once the app has the permission. Until then, the Inbox tab may show "No conversations" or a permission message for Facebook; Instagram inbox can still work when connected via Facebook if the app has Instagram Messaging enabled.

**If you see "Invalid Scopes: instagram_manage_insights":** You must add this permission in the Meta app before the OAuth URL can request it. Steps: (1) In [Meta for Developers](https://developers.facebook.com/), open your app. (2) In the left sidebar go to **App Review** → **Permissions and features** (or **Use cases** → **Customize** for the Facebook Login use case). (3) Find **Instagram Graph API** or **Facebook Login** and add the permission **instagram_manage_insights** (often listed as “Instagram insights” or “Read Instagram insights”). (4) If it’s under App Review, you may need to request it or switch to Development mode and add it to the use case. Once the permission is added to the app, you can add `instagram_manage_insights` back to the Instagram (via Facebook) scope in the OAuth start route so the dashboard can show Views, Reach, and Profile views. Until then, the app requests Instagram without that scope so connect still works; only insights will be limited (e.g. followers only).

**If Facebook connects but shows "Facebook Page" with no profile picture:** From Graph API v19, `me/accounts` requires the **business_management** permission ("Manage your business and its assets"). When you connect Facebook, make sure to allow that permission when the dialog asks. If you already connected without it, disconnect and reconnect Facebook and grant **business_management** when prompted. The app requests this scope automatically; ensure your Meta app has the Facebook Login product and that the permission is available for your app type.

**If analytics, posts, or inbox show zero or "Reconnect to grant Page insights permission":** The app must store the **Page** access token (not the user token) for Facebook and linked Instagram. When you complete "Connect" and choose a Page, the app now saves that Page's token so insights, posts, and inbox work. If you connected before this fix, **disconnect the Facebook account (and Instagram if linked) in the dashboard, then connect again and choose the same Page**. After reconnecting once, analytics, posts, and inbox should load.

7. Go to **App Settings** -> **Basic**.
8. **Copy these values:** (use as `META_APP_ID` / `META_APP_SECRET` in the web app env)
   - App ID (Client ID)
   - App Secret (Click "Show")

*Note: Instagram uses the same Meta app; both redirect URIs above must be in Valid OAuth Redirect URIs.*

**Inbox scopes:** The app’s OAuth start route already requests inbox-related scopes so that when you implement the Inbox API you won’t need to ask users to reconnect. **Instagram (via Facebook):** `instagram_manage_messages`, `pages_messaging`. **Instagram (direct, API with Instagram login):** `instagram_business_manage_messages`. **Facebook:** `pages_messaging`. **Twitter/X:** `dm.read`, `dm.write`. Ensure these permissions are enabled in your Meta and Twitter developer apps.

**Insights (views, reach, profile views):** The app requests `instagram_manage_insights` when connecting Instagram via Facebook . For Facebook the app requests **read_insights** (add it in Meta app → App Review if you see Invalid Scopes). The dashboard shows full metrics (impressions, reach, profile views for Instagram; page impressions, page views, reach for Facebook). Ensure these permissions are added to your Meta app under Use cases → Permissions and features (see “Invalid Scopes: instagram_manage_insights” if you see that error). For Instagram-only login, `instagram_business_manage_insights` is also requested. After connecting, users may need to disconnect and reconnect once to grant the new scopes.

**Vercel / env vars for Inbox (when you implement webhooks):** To receive real-time message events from Meta (Instagram/Facebook), you will need to add a webhook endpoint and configure Meta to call it. In Vercel (or your host), add: **`WEBHOOK_VERIFY_TOKEN`** — a random string you choose; Meta sends it when verifying your webhook URL. Your API route should respond to GET with this token in the query. Optionally **`WEBHOOK_CALLBACK_URL`** — the full URL of your webhook (e.g. `https://agent4socials.com/api/webhooks/instagram`). If not set, you can derive it from **`NEXT_PUBLIC_APP_URL`** + path. No extra variables are required for the Inbox feature to *display* messages once scopes are granted; webhook vars are only for *real-time* updates.

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

**Connect a LinkedIn Page (company page):** The app offers two options: **Personal profile** and **LinkedIn Page**. The Page flow uses the same scopes as personal by default so authorization does not fail with LinkedIn’s “Bummer, something went wrong” (that error appears when you request `r_organization_social` / `w_organization_social` without the **Marketing Developer Platform** or **Community Management API** product approved). With default scopes, the connection completes and the account is labeled “LinkedIn Page” in the app; the callback cannot fetch the real Page name until the app has org access. To request org scopes and resolve the Page name (after LinkedIn approves the product), set **`LINKEDIN_REQUEST_ORG_SCOPES`** = `true` in your environment and redeploy. Then add/request the **Community Management API** (or **Marketing Developer Platform**) in the LinkedIn Developer Portal so the authorization succeeds with those scopes.

---

## 6. Threads (Meta)

Threads uses its own **Threads API** product in Meta for Developers. You get a **Threads app ID** and **Threads app secret** (separate from your main Meta App ID/Secret used for Instagram and Facebook).

1. Go to [Meta for Developers](https://developers.facebook.com/) → **My Apps**.
2. Either **create a new app** or open an existing app. When creating, choose the **“Access the Threads API”** use case (under “Other” or “Consumer” depending on the flow). If you add it to an existing app, go to **Use cases** in the left menu → **Add use case** → **Access the Threads API**.
3. In the left menu, open **Use cases** → click **Access the Threads API** to customize it.
   - **Permissions:** `threads_basic` is required. For posting from Agent4Socials, add **`threads_content_publish`**. Add any others you need (e.g. `threads_manage_replies`, `threads_read_replies`).
4. In the left menu, go to **Settings** (under the Threads product).
   - Note your **Threads app ID** and **Threads app secret** (use these for Threads only, not the main Meta App ID/Secret).
   - **Client OAuth Settings** → **Valid OAuth redirect URIs:** add  
     `https://agent4socials.com/api/social/oauth/threads/callback`  
     (and for local dev, e.g. `http://localhost:3000/api/social/oauth/threads/callback` if you use that.)
   - **Deauthorize callback URL:** e.g. `https://agent4socials.com/api/social/oauth/threads/deauthorize` (your endpoint that accepts a POST from Meta when a user disconnects).
   - **Data Deletion Requests URL:** e.g. `https://agent4socials.com/api/social/oauth/threads/data-deletion` (your endpoint for data deletion requests from Meta).
   - Click **Save**.
5. **Test users (optional):** Under **Add or Remove Threads Test Users** you can add testers. Until the app is approved, only admins/developers/testers can connect.
6. **Publishing / App Review:** When you’re ready for any user to connect, use **Publish** and complete **App Review** for the Threads use case (same idea as for Instagram/Facebook).

**Env vars (web app):**  
`THREADS_APP_ID` = Threads app ID  
`THREADS_APP_SECRET` = Threads app secret  
Optional: `THREADS_REDIRECT_URI` = `https://agent4socials.com/api/social/oauth/threads/callback` if you need to force this exact URL.

**In the app code** you will need to: add `THREADS` to the Platform enum (Prisma), add Threads to the OAuth start URL (Meta’s Threads OAuth endpoint and scopes), handle the callback (exchange code for token, fetch profile, save `SocialAccount`), add Threads to the composer platform list and to publish logic (Threads API for creating posts). Meta’s Threads OAuth is similar to Facebook (authorize with `threads_basic` and `threads_content_publish`).

---

## 7. Bluesky

Bluesky uses **atproto OAuth** (not the same as “paste client ID/secret and redirect URI” style). To let users connect their Bluesky account you need to implement the atproto OAuth client flow.

**High level:**

1. **Client registration**  
   Your app is identified by a **client_id** that is a **URL** where you host a **client metadata JSON** document (not a numeric ID). Example:  
   `https://agent4socials.com/api/social/oauth/bluesky/client-metadata.json`  
   That URL is the `client_id`. The JSON must describe your app (redirect URIs, scopes, grant types, etc.). See [Bluesky OAuth client implementation](https://docs.bsky.app/docs/advanced-guides/oauth-client).

2. **OAuth flow**  
   atproto OAuth uses:
   - **PKCE** (required)
   - **PAR** (Pushed Authorization Requests): you POST the auth params to the server and get a `request_uri`, then redirect the user with that URI.
   - **DPoP** (Demonstrating Proof of Possession): tokens are bound to a key; you need to sign requests with a per-session key and handle DPoP nonces from the server.

3. **Client type**  
   For a **web app with a backend** (like Agent4Socials), you typically implement a **confidential** client: client metadata at the `client_id` URL, and a **client assertion** (JWT signed with a key whose public part is in the metadata) for token and PAR requests. You store the client secret (or private key) in env vars and never expose it to the browser.

4. **Where to implement**  
   - **Backend:**  
     - Serve the client metadata JSON at the URL you use as `client_id`.  
     - OAuth start: build PAR request (with PKCE, DPoP key, and optionally client assertion), POST to the authorization server’s PAR endpoint, then redirect the user to the auth URL with the returned `request_uri`.  
     - Callback: exchange `code` for tokens at the token endpoint (with PKCE verifier, DPoP, client assertion).  
     - Store access/refresh token and use DPoP for all API calls to Bluesky (e.g. create post).  
   - **Discovery:**  
     The user’s handle (e.g. `user.bsky.social`) or DID resolves to a PDS; the PDS exposes authorization server metadata (e.g. `/.well-known/oauth-authorization-server`). You use that to get the PAR, authorization, and token endpoints.

**Practical steps:**

1. Read the [atproto OAuth spec](https://atproto.com/specs/auth) and Bluesky’s [OAuth client guide](https://docs.bsky.app/docs/advanced-guides/oauth-client).
2. Decide your **client_id** URL (e.g. `https://agent4socials.com/api/social/oauth/bluesky/client-metadata.json`) and create a route that serves the client metadata JSON (redirect_uris, scopes, `dpop_bound_access_tokens: true`, etc.).
3. Implement **PAR** (POST auth params, get `request_uri`, redirect), **PKCE**, and **DPoP** (generate keypair per session, sign DPoP proof for each request, handle `DPoP-Nonce` from responses).
4. For a confidential client, add a keypair (or use client secret if supported), put the public key in client metadata (`jwks` or `jwks_uri`), and send a JWT client assertion on PAR and token requests.
5. In your app: add **BLUESKY** to the Platform enum, add Bluesky to the composer and to publish logic, and use the atproto/Bluesky APIs (e.g. create post) with the DPoP-bound access token.

**SDK / helpers:**  
Check whether Bluesky or the atproto team provide a TypeScript/Node SDK that implements OAuth (PAR, DPoP, token exchange). Using an SDK will reduce the amount of crypto and protocol code you write.

**Summary:**  
- **Threads:** Create a Meta app with the Threads API use case, get Threads app ID/secret, set redirect URI and env vars, then add THREADS to your app (enum, OAuth start/callback, composer, publish).  
- **Bluesky:** Implement atproto OAuth (client metadata URL, PAR, PKCE, DPoP, confidential client if you have a backend), then add BLUESKY to your app (enum, OAuth flow, composer, publish).  

---

## What to do next?

Add the env vars to your **web app** (e.g. Vercel → **agent4socials** project → Settings → Environment Variables). Use the key names your app expects, e.g. `META_APP_ID`, `META_APP_SECRET`, `YOUTUBE_CLIENT_ID`, `YOUTUBE_CLIENT_SECRET`, `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET`, `TWITTER_CLIENT_ID`, `TWITTER_CLIENT_SECRET`, `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET`, and for Threads: `THREADS_APP_ID`, `THREADS_APP_SECRET`. Set `NEXT_PUBLIC_APP_URL=https://agent4socials.com` (or your production URL). Then **Redeploy** the web app.

**Implementing Threads and Bluesky in the app:**  
After the platforms are approved and env vars are set, the codebase must be updated to support each new platform: add the platform to the Prisma `Platform` enum and run a migration, add OAuth start and callback handling (and for Bluesky, atproto OAuth with PAR/DPoP and client metadata), add the platform to the composer UI and to the publish API (calling Threads API or Bluesky/atproto API when posting).

**Inbox (manage messages from all platforms except YouTube):**  
The app has an Inbox page (Dashboard → Inbox). To enable reading and replying to messages when the feature is implemented, add these scopes in each platform’s developer console and in the OAuth flow: **Instagram** (via Facebook): `instagram_manage_messages`, `pages_messaging`. **Facebook**: `pages_messaging` (or `pages_messaging_subscriptions`). **X (Twitter)**: `dm.read`, `dm.write`. **TikTok**: check TikTok for Developers for messaging permissions. **LinkedIn**: messaging-related product/scopes in the LinkedIn Developer Portal. YouTube does not support DMs.
