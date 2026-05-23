# Threads setup (Agent4Socials)

Threads OAuth uses the **Threads App ID** and **Threads App Secret** from Meta (not always the same numbers as the main Facebook App ID).

## Meta Developer Portal

1. App → **Use cases** → add **Access the Threads API**.
2. Complete **App Review → Testing** API calls for required scopes (see Graph API Explorer with `graph.threads.net`).
3. **Threads app settings → Basic** → copy **Threads App ID** and **Threads App Secret**.
4. **Threads use case → Settings** → fill **all three** callback fields (Meta will not save if any are empty):
   - **Redirect Callback URLs:** `https://agent4socials.com/api/social/oauth/threads/callback`
   - **Uninstall Callback URL:** `https://agent4socials.com/api/social/oauth/threads/deauthorize`
   - **Delete Callback URL:** `https://agent4socials.com/api/social/oauth/threads/data-deletion`
   - Use **Add URL** under Redirect Callback URLs, then **Save**.
   - (add staging URLs too if you use a preview domain)

## Vercel environment variables

| Variable | Required | Notes |
|----------|----------|--------|
| `THREADS_APP_ID` | Recommended | Threads App ID from Meta → Threads → Basic |
| `THREADS_APP_SECRET` | Recommended | Threads App Secret from the same screen |
| `META_APP_ID` | Fallback | Used only if `THREADS_APP_ID` is unset |
| `META_APP_SECRET` | Fallback | Used only if `THREADS_APP_SECRET` is unset |
| `THREADS_REDIRECT_URI` | Optional | Must use the **same host** as `NEXT_PUBLIC_APP_URL` (e.g. both `agent4socials.com` or both `www.agent4socials.com`). If hosts differ, the app ignores `THREADS_REDIRECT_URI` and uses `{APP_URL}/api/social/oauth/threads/callback`. |
| `THREADS_OAUTH_SCOPES` | Optional | Override default scopes |

If Connect opens Threads with **"No app ID was sent"**, the server built an authorize URL with an empty `client_id`. Add `THREADS_APP_ID` / `THREADS_APP_SECRET` in Vercel for **Production**, then **Redeploy**.

### "URL Blocked" / redirect URI not whitelisted (error 1349168)

Meta only allows the **exact** callback URL your app sends.

**See what production uses:** open  
`https://agent4socials.com/api/social/oauth/threads/setup-info`  
and copy `redirectUri` into Meta (character for character).

Default:

`https://agent4socials.com/api/social/oauth/threads/callback`

(no trailing slash)

**Fix in Meta Developer Portal:**

1. Open your app → **Use cases** → **Access the Threads API** → **Settings**.
2. Fill **all three** callbacks (Redirect, Uninstall, Delete) and **Save**.
3. Confirm **Threads App ID** on that page matches **`THREADS_APP_ID`** in Vercel (last 4 digits should match `appIdSuffix` from setup-info). If Vercel only has `META_APP_ID` (Facebook App ID), OAuth may use the wrong app and ignore your Threads callback list.
4. **App settings → Basic → App domains:** `agent4socials.com`
5. If it still fails, also add the same `redirectUri` under **Facebook Login → Settings → Valid OAuth Redirect URIs** (some apps require both).
6. Set `NEXT_PUBLIC_APP_URL=https://agent4socials.com` in Vercel Production and redeploy. Optional pin: `THREADS_REDIRECT_URI=https://agent4socials.com/api/social/oauth/threads/callback`

Wait a few minutes after saving in Meta before retrying Connect.

Default OAuth scopes: `threads_basic`, `threads_content_publish`, `threads_manage_insights`, `threads_read_replies`, `threads_manage_replies`, `threads_manage_mentions`, `threads_share_to_instagram`.

## Share to Instagram Story

In the Composer, when **Threads** is selected, users can enable **Also share to Instagram Story**. Publishing sends `crossreshare_to_ig=true` on `threads_publish` (linked Instagram account required).

After adding `threads_share_to_instagram`, reconnect Threads from Account so the token includes the new scope.

## Connect in the app

**Dashboard → Account → Connect** or `?connect=THREADS` on the dashboard URL.

## Inbox (replies and mentions)

Threads **direct messages** are not available on the official Threads Graph API for third-party apps. In Agent4Socials, Threads appears in **Inbox → Comments** (not Messages):

- **Replies** on your synced threads (`GET {thread-id}/replies`, scope `threads_read_replies`)
- **@mentions** (`GET me/mentions`, scope `threads_manage_mentions`)
- **Reply from the app** (`POST {media-id}/replies`, scope `threads_manage_replies`)

Sync posts first (open **Dashboard** with Threads selected, or wait for background sync) so the inbox has thread IDs to load replies from.

## Database

Production DBs need enum value `THREADS` on `Platform`. The OAuth callback runs `ensureThreadsPlatformEnum()` automatically; you can also deploy Prisma migrations when available.
