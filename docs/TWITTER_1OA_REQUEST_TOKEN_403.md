# Fix: "Twitter request token failed (HTTP 403)"

When you click **Enable image upload** for an X (Twitter) account and see this error, X is rejecting the OAuth 1.0a request. Fix it in the **X Developer Portal** and in **Vercel** (env vars).

## 1. Add the OAuth 1.0a Callback URL in X Developer Portal

1. Go to [developer.x.com](https://developer.x.com) and open your **Project** and **App**.
2. Open **App settings** or **User authentication settings**.
3. Find the **Callback URL** / **Callback URL allowlist** section (for **OAuth 1.0a**; this is separate from OAuth 2.0 Redirect URI).
4. Add this URL **exactly** (use your real domain if different):
   - **Production:** `https://agent4socials.com/api/social/oauth/twitter-1oa/callback`
   - No trailing slash; must match exactly.
5. Save.

## 2. Use the right keys in Vercel

- **TWITTER_API_KEY** = your app’s **API Key** (Consumer Key).
- **TWITTER_API_SECRET** = your app’s **API Key Secret** (Consumer Key Secret).

These are under **Keys and tokens** for the app in the X Developer Portal. **Do not** use Access Token / Access Token Secret here.

In Vercel: **Project → Settings → Environment Variables**. Set `TWITTER_API_KEY` and `TWITTER_API_SECRET`, then **redeploy** so the new values are used.

## 3. Try again

In **Dashboard → Accounts**, select your X account and click **Enable image upload** again.

---

If it still fails, check Vercel logs for `[Twitter OAuth 1.0a] request_token failed` to see the response body from X (sometimes it includes a more specific reason).
