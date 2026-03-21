# Reddit app setup (connect Reddit to Agent4Socials)

To allow users to connect their Reddit account, you need to create a Reddit application and add the credentials to your environment.

## 1. Create a Reddit application

1. **Log in to Reddit** (use the account that will own the app; it can be a personal or brand account).
2. **Open the app preferences page:**  
   [https://www.reddit.com/prefs/apps](https://www.reddit.com/prefs/apps)
3. **Click “create another app…”** (or “create application”).
4. **Fill in the form:**
   - **Name:** e.g. `Agent4Socials` or your product name.
   - **App type:** select **“web app”**.
   - **Description:** optional (e.g. “Schedule and manage your Reddit content from one dashboard”).
   - **About url:** optional; can be your marketing site or `https://agent4socials.com`.
   - **Redirect uri:** must match exactly what your app uses:
     - **Production:** `https://agent4socials.com/api/social/oauth/reddit/callback`  
       (or your production domain, e.g. `https://yourdomain.com/api/social/oauth/reddit/callback`).
     - **Local:** for local testing you can add a second redirect, e.g.  
       `http://localhost:3000/api/social/oauth/reddit/callback`.
5. **Click “create app”.**

## 2. Get your Client ID and Secret

- **Client ID:** Under your app name you’ll see a string (e.g. `abc123XYZ`). That is your **client id** (sometimes labeled “personal use script”).
- **Client secret:** In the same block there is a **secret** field. That is your **client secret** (sometimes labeled “secret”).

Copy both; you’ll add them to your environment.

## 3. Add environment variables

In **Vercel** (or your host) and in local **.env**:

| Variable | Description |
|----------|-------------|
| `REDDIT_CLIENT_ID` | The client id from the Reddit app (e.g. the “personal use script” value). |
| `REDDIT_CLIENT_SECRET` | The secret from the Reddit app. |
| `REDDIT_REDIRECT_URI` | Optional. Must match the redirect URI you set in Reddit (e.g. `https://agent4socials.com/api/social/oauth/reddit/callback`). If omitted, the app builds it from `NEXT_PUBLIC_APP_URL` + `/api/social/oauth/reddit/callback`. |
| `REDDIT_USER_AGENT` | **Strongly recommended.** A unique string Reddit requires on every API call, e.g. `web:com.yourcompany.agent4socials:v1.0 (by /u/YourRedditUsername)`. If unset, the app uses a default; for production, set your own to match [Reddit’s API rules](https://github.com/reddit-archive/reddit/wiki/API). |

**Example (.env):**

```bash
REDDIT_CLIENT_ID=your_client_id_here
REDDIT_CLIENT_SECRET=your_client_secret_here
REDDIT_USER_AGENT=web:com.yourcompany.agent4socials:v1.0 (by /u/yourusername)
# Optional if base URL is correct:
# REDDIT_REDIRECT_URI=https://agent4socials.com/api/social/oauth/reddit/callback
```

After adding or changing these, **redeploy** (and restart local dev server) so the new values are used.

## 4. Redirect URI must match

- The **redirect uri** in the Reddit app (step 1) must match exactly what your app sends (including `http` vs `https`, domain, path, no trailing slash unless you use one).
- Default redirect used by the app:  
  `{NEXT_PUBLIC_APP_URL or NEXT_PUBLIC_SITE_URL or https://agent4socials.com}/api/social/oauth/reddit/callback`  
  So set the same value in Reddit’s “redirect uri” and, if needed, in `REDDIT_REDIRECT_URI`.

## 5. Scopes used

The app requests these OAuth scopes:

- `identity` – basic profile (username, id).
- `read` – read content.
- `submit` – submit posts and comment replies.
- `edit` – edit content.
- `history` – read history.
- `privatemessages` – inbox (comment replies in inbox, private messages), and sending PM replies from the Inbox.

If you connected Reddit **before** `privatemessages` was added, **disconnect and reconnect** Reddit in Agent4Socials so the new scope is granted.

## 6. Database migration

The app stores optional per-target options (e.g. subreddit) on `PostTarget`. Run migrations after deploy:

`npx prisma migrate deploy` (or your usual migration command).

## 7. Test the connection

1. Deploy (or run locally) with the env vars set.
2. In Agent4Socials, go to **Dashboard** and click **Connect** for **Reddit**.
3. You should be sent to Reddit to authorize, then redirected back to the dashboard with the Reddit account connected.

If you see “REDDIT_CLIENT_ID and REDDIT_CLIENT_SECRET must be set”, the server doesn’t see the variables: check Vercel env config (and Production checkbox) and redeploy, or restart the local server after editing `.env`.

## 8. Current behavior

- **Connect:** OAuth stores access and refresh tokens; profile appears on the dashboard and Accounts page.
- **Analytics:** Karma as the main “followers” style metric; chart uses engagement (score + comments) on your recent submissions. Reddit does not offer Instagram-style impressions.
- **Composer:** Text **self posts** only. Set **subreddit** (without `r/`) and optional **title**; body is your post content. **Media is not** published to Reddit from the composer yet.
- **Schedule / Post now:** Same publish path as other platforms (scheduled posts use your cron or publish flow).
- **Inbox:** **Comments** tab uses Reddit inbox for reply threads (`t1`). **Messages** tab lists private messages (`t4`). **Engagement** tab lists recent submissions with scores and comment counts.
- **Reconnect:** If API calls fail with 403, reconnect Reddit and confirm scopes.

## Summary checklist

- [ ] Reddit app created at [reddit.com/prefs/apps](https://www.reddit.com/prefs/apps) (type: web app).
- [ ] Redirect uri set to your callback URL (e.g. `https://agent4socials.com/api/social/oauth/reddit/callback`).
- [ ] `REDDIT_CLIENT_ID` and `REDDIT_CLIENT_SECRET` set in Vercel (and .env for local).
- [ ] `REDDIT_USER_AGENT` set to your app’s string (recommended).
- [ ] Optional: `REDDIT_REDIRECT_URI` set if you use a different base URL.
- [ ] Run DB migrations after upgrading (`PostTarget.options`).
- [ ] Redeploy / restart and test Connect Reddit from the dashboard.
