# Favicon

The site favicon is the Agent4Socials "A4" logo.

## Where it’s set

- **Tab and Apple icon:** `apps/web/src/app/layout.tsx` sets `metadata.icons` to `/logo.svg?v=2`. Bump the version (e.g. `?v=3`) when you change the logo so browsers fetch the new favicon.
- **Source file:** `apps/web/public/logo.svg` is the 4S logo. Keep `app/icon.svg` in sync if needed; the live favicon is served from `public/logo.svg`.
- **`/favicon.ico`:** Next.js rewrites `/favicon.ico` to `/logo.svg` (`next.config.ts`) so Google and clients that request `favicon.ico` get our logo instead of Vercel's default.

## Why the favicon might not change right away

1. **Browser cache**  
   Browsers cache favicons for a long time. To see an update:
   - Hard refresh: Cmd+Shift+R (Mac) or Ctrl+Shift+R (Windows).
   - Or open the site in an incognito/private window.

2. **Google search results**  
   Google caches favicons and can take days or weeks to refresh. To speed it up:
   - Use [Google Search Console](https://search.google.com/search-console) and request indexing for your homepage, and/or use “URL Inspection” for the site URL.

3. **After changing the icon**  
   - Update `apps/web/public/logo.svg` (and `app/icon.svg` if you keep it in sync).
   - In `layout.tsx`, bump the query param in `icons.icon` and `icons.apple` (e.g. `?v=3`).
   - Redeploy so the new icon URL is used and caches are bypassed.

## Optional: favicon.ico

Some tools and older clients request `/favicon.ico` specifically. Next.js only uses a file at `app/favicon.ico` (in the app root). If you add one (e.g. export your logo as a 32×32 or 48×48 `.ico` and put it in `apps/web/src/app/favicon.ico`), Next.js will serve it automatically.
