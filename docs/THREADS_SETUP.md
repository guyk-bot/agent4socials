# Threads setup (Agent4Socials)

Threads uses the same Meta app as Facebook/Instagram (`META_APP_ID` / `META_APP_SECRET`).

## Meta Developer Portal

1. App → **Use cases** → add **Access the Threads API**.
2. Complete **App Review → Testing** API calls for required scopes (see Graph API Explorer with `graph.threads.net`).
3. **Threads app settings** → add redirect URI:
   - `https://agent4socials.com/api/social/oauth/threads/callback`
   - (and your staging URL if applicable)

## Vercel environment variables

| Variable | Required | Notes |
|----------|----------|--------|
| `META_APP_ID` | Yes | Same as Facebook |
| `META_APP_SECRET` | Yes | Same as Facebook |
| `THREADS_REDIRECT_URI` | Optional | Defaults to `{APP_URL}/api/social/oauth/threads/callback` |
| `THREADS_OAUTH_SCOPES` | Optional | Override default scopes |

Default OAuth scopes: `threads_basic`, `threads_content_publish`, `threads_manage_insights`, `threads_read_replies`, `threads_manage_replies`, `threads_manage_mentions`.

## Connect in the app

**Dashboard → Account → Connect** or `?connect=THREADS` on the dashboard URL.

## Database

Production DBs need enum value `THREADS` on `Platform`. The OAuth callback runs `ensureThreadsPlatformEnum()` automatically; you can also deploy Prisma migrations when available.
