# Threads setup (Agent4Socials)

Threads OAuth uses the **Threads App ID** and **Threads App Secret** from Meta (not always the same numbers as the main Facebook App ID).

## Meta Developer Portal

1. App → **Use cases** → add **Access the Threads API**.
2. Complete **App Review → Testing** API calls for required scopes (see Graph API Explorer with `graph.threads.net`).
3. **Threads app settings → Basic** → copy **Threads App ID** and **Threads App Secret**.
4. **Client OAuth Settings** → **Valid OAuth redirect URIs** → add (use **Add URL** in the dropdown if the field does not save):
   - `https://agent4socials.com/api/social/oauth/threads/callback`
   - (and your staging URL if applicable)

## Vercel environment variables

| Variable | Required | Notes |
|----------|----------|--------|
| `THREADS_APP_ID` | Recommended | Threads App ID from Meta → Threads → Basic |
| `THREADS_APP_SECRET` | Recommended | Threads App Secret from the same screen |
| `META_APP_ID` | Fallback | Used only if `THREADS_APP_ID` is unset |
| `META_APP_SECRET` | Fallback | Used only if `THREADS_APP_SECRET` is unset |
| `THREADS_REDIRECT_URI` | Optional | Defaults to `{APP_URL}/api/social/oauth/threads/callback` |
| `THREADS_OAUTH_SCOPES` | Optional | Override default scopes |

If Connect opens Threads with **"No app ID was sent"**, the server built an authorize URL with an empty `client_id`. Add `THREADS_APP_ID` / `THREADS_APP_SECRET` in Vercel for **Production**, then **Redeploy**.

Default OAuth scopes: `threads_basic`, `threads_content_publish`, `threads_manage_insights`, `threads_read_replies`, `threads_manage_replies`, `threads_manage_mentions`, `threads_share_to_instagram`.

## Share to Instagram Story

In the Composer, when **Threads** is selected, users can enable **Also share to Instagram Story**. Publishing sends `crossreshare_to_ig=true` on `threads_publish` (linked Instagram account required).

After adding `threads_share_to_instagram`, reconnect Threads from Account so the token includes the new scope.

## Connect in the app

**Dashboard → Account → Connect** or `?connect=THREADS` on the dashboard URL.

## Database

Production DBs need enum value `THREADS` on `Platform`. The OAuth callback runs `ensureThreadsPlatformEnum()` automatically; you can also deploy Prisma migrations when available.
