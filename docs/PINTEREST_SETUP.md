# Pinterest integration (Agent4Socials)

This app uses the **Pinterest API v5** with OAuth 2.0. Users connect from the dashboard sidebar; we exchange the code for access and refresh tokens, then call `user_account`, `boards`, analytics endpoints, and `POST /v5/pins` for publishing.

## Vercel environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `PINTEREST_APP_ID` | Yes | App ID from [Pinterest Developers](https://developers.pinterest.com/) (same as Client ID). Alias: `PINTEREST_CLIENT_ID`. |
| `PINTEREST_APP_SECRET` | Yes | App secret. Alias: `PINTEREST_CLIENT_SECRET`. While Pinterest shows "Unavailable while trial access pending", token exchange will not work until the secret is visible. |
| `PINTEREST_REDIRECT_URI` | Recommended | Must **exactly** match a redirect URI in the Pinterest app. Default if unset: `https://<your-domain>/api/social/oauth/pinterest/callback` (derived from `NEXT_PUBLIC_APP_URL` / `NEXT_PUBLIC_SITE_URL`). |
| `PINTEREST_OAUTH_SCOPES` | Optional | Override default scopes (comma-separated). Default: `user_accounts:read,pins:read,boards:read,pins:write,boards:write`. |
| `NEXT_PUBLIC_APP_URL` or `NEXT_PUBLIC_SITE_URL` | Yes (for OAuth) | Canonical site URL used to build the default callback URL. |

## Pinterest Developer Portal checklist

1. Create an app and note **App ID** and **App secret** (when available).
2. Under **Redirect URIs**, add:
   - Production: `https://agent4socials.com/api/social/oauth/pinterest/callback` (replace with your production domain if different).
   - Local dev: `http://localhost:3000/api/social/oauth/pinterest/callback` (or your dev port), if Pinterest allows it for your app.
3. Request the scopes you need. For connect, analytics (where permitted), and image Pins we request read/write on pins and boards plus `user_accounts:read`.
4. **Trial access:** Until Pinterest approves access, the secret may be hidden and some endpoints may return errors. Analytics (`user_account/analytics`) may return 403 until the app has the right product access.

## Behavior in the product

- **Connect:** OAuth with `refreshable=true` so Pinterest returns a refresh token when allowed.
- **Default board:** After token exchange we call `GET /v5/boards` and store the first board ID in `SocialAccount.credentialsJson` as `pinterestDefaultBoardId` for publishing.
- **Composer:** Pinterest must have at least one **image** in the post (video-only or text-only is blocked in the UI).
- **Publishing:** `POST https://api.pinterest.com/v5/pins` with `media_source.source_type: image_url` and a publicly fetchable HTTPS image URL (we reuse the same media serving approach as Meta/TikTok where applicable).

## Troubleshooting

- **"Could not save account. Check database connection and schema"** (callback URL with `code=...`) **or Vercel log `22P02` / `invalid_text_representation`:** The production database is missing the `PINTEREST` value on the Postgres `Platform` enum. Fix it in one of these ways:
  1. **Redeploy** after pulling the latest repo: the Vercel **build** runs `prisma migrate deploy` via `scripts/vercel-build.mjs`. If the build fails with **Tenant or user not found**, fix **`DATABASE_DIRECT_URL`** in Vercel (Supabase **Session** or **Direct** connection string, not the Transaction pooler URI). See `apps/web/MIGRATE.md`. To deploy the app without migrate, set **`SKIP_PRISMA_MIGRATE_ON_VERCEL=1`** temporarily, then apply SQL manually.
  2. **Manual SQL (fastest):** In Supabase → SQL Editor, run `apps/web/scripts/ensure-pinterest-platform-enum.sql` (adds `PINTEREST` to the enum). Then try **Connect** again in the app.
- **"Pinterest did not return an access token":** Check `PINTEREST_APP_SECRET`, redirect URI match, and that the app is not blocking the request.
- **403 on analytics:** Normal if the app lacks analytics access; profile metrics may still work.
- **"No Pinterest board on file":** User has no boards or `/boards` failed at connect; create a board on Pinterest and reconnect.
