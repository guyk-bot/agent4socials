# Fix: "Twitter request token failed (HTTP 403)"

When you click **Enable image upload** for an X (Twitter) account and see this error, X is rejecting the OAuth 1.0a request. Fix it in the **X Developer Console** and in **Vercel** (env vars).

## 1. Add the OAuth 1.0a Callback URL in X Developer Console

In the **new X Developer Console** ([console.x.com](https://console.x.com)) there is no separate "App settings" or "User authentication settings". Use this path:

1. Go to [console.x.com](https://console.x.com) → **Apps** → select your app (e.g. **2025183217750257664agent4socia**).
2. In the app panel, under **OAuth 2.0 Keys**, click **Edit settings**.
3. On the **App info** page you’ll see **Callback URI / Redirect URL**. You already have the OAuth 2.0 callback (e.g. `https://agent4socials.com/api/social/oauth/twitter/callback`). Click **Add another** and add this URL **exactly** (for the OAuth 1.0a "Enable image upload" flow):
   - `https://agent4socials.com/api/social/oauth/twitter-1oa/callback`
   - No trailing slash; same domain if you use a different one.
4. Click **Save Changes**.

So you’ll have two callback URLs: one for OAuth 2.0 (connect account) and one for OAuth 1.0a (enable image/video upload).

## 2. Use the right keys in Vercel

- **TWITTER_API_KEY** = your app’s **API Key** (Consumer Key).
- **TWITTER_API_SECRET** = your app’s **API Key Secret** (Consumer Key Secret).

In the app page (Apps → your app), these are under **OAuth 1.0 Keys**: use **Consumer Key** and **Consumer Key Secret** (the "Show" next to Consumer Key). **Do not** use the OAuth 1.0 Access Token / Access Token Secret for TWITTER_API_KEY / TWITTER_API_SECRET.

In Vercel: **Project → Settings → Environment Variables**. Set `TWITTER_API_KEY` and `TWITTER_API_SECRET`, then **redeploy** so the new values are used.

## 3. Try again

In **Dashboard → Accounts**, select your X account and click **Enable image upload** again.

---

If it still fails, check Vercel logs for `[Twitter OAuth 1.0a] request_token failed` to see the response body from X (sometimes it includes a more specific reason).
