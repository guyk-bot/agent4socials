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

**Example (.env):**

```bash
REDDIT_CLIENT_ID=your_client_id_here
REDDIT_CLIENT_SECRET=your_client_secret_here
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

The app requests these OAuth scopes so users can connect and (in the future) post:

- `identity` – basic profile (username, id).
- `read` – read content.
- `submit` – submit posts/comments.
- `edit` – edit content.
- `history` – read history.

If you change scopes in code, ensure the Reddit app is allowed to use them (no extra Reddit dashboard step for these standard scopes).

## 6. Test the connection

1. Deploy (or run locally) with the env vars set.
2. In Agent4Socials, go to **Dashboard** and click **Connect** for **Reddit**.
3. You should be sent to Reddit to authorize, then redirected back to the dashboard with the Reddit account connected.

If you see “REDDIT_CLIENT_ID and REDDIT_CLIENT_SECRET must be set”, the server doesn’t see the variables: check Vercel env config (and Production checkbox) and redeploy, or restart the local server after editing `.env`.

## 7. Current behavior

- **Connect:** Users can connect their Reddit account; the app stores the token and shows the account in the dashboard and accounts page.
- **Publishing:** Reddit is not yet supported for scheduling/publishing; the composer will show an error if Reddit is selected. Connect is supported for future posting and for consistency with other platforms.

## Summary checklist

- [ ] Reddit app created at [reddit.com/prefs/apps](https://www.reddit.com/prefs/apps) (type: web app).
- [ ] Redirect uri set to your callback URL (e.g. `https://agent4socials.com/api/social/oauth/reddit/callback`).
- [ ] `REDDIT_CLIENT_ID` and `REDDIT_CLIENT_SECRET` set in Vercel (and .env for local).
- [ ] Optional: `REDDIT_REDIRECT_URI` set if you use a different base URL.
- [ ] Redeploy / restart and test Connect Reddit from the dashboard.
