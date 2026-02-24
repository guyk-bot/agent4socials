# Favicon

The site favicon is the Agent4Socials "A4" logo.

## Where it’s set

- **Tab / browser icon:** `apps/web/src/app/icon.svg`  
  Next.js serves this at a URL like `/icon?<hash>` so the icon updates when the file changes (cache-busting).
- **Apple touch icon:** `metadata.icons.apple` in `apps/web/src/app/layout.tsx` points to `/logo.svg`.
- **Shared logo asset:** `apps/web/public/logo.svg` (used for OG, Apple, etc.). Keep this in sync with `app/icon.svg` if you change the logo.

## Why the favicon might not change right away

1. **Browser cache**  
   Browsers cache favicons for a long time. To see an update:
   - Hard refresh: Cmd+Shift+R (Mac) or Ctrl+Shift+R (Windows).
   - Or open the site in an incognito/private window.

2. **Google search results**  
   Google caches favicons and can take days or weeks to refresh. To speed it up:
   - Use [Google Search Console](https://search.google.com/search-console) and request indexing for your homepage, and/or use “URL Inspection” for the site URL.

3. **After changing the icon**  
   - Update both `apps/web/src/app/icon.svg` and `apps/web/public/logo.svg` if you want the same logo everywhere.
   - Redeploy so the new icon is live; the new `/icon?<hash>` URL will then be used for new visits.

## Optional: favicon.ico

Some tools and older clients request `/favicon.ico` specifically. Next.js only uses a file at `app/favicon.ico` (in the app root). If you add one (e.g. export your logo as a 32×32 or 48×48 `.ico` and put it in `apps/web/src/app/favicon.ico`), Next.js will serve it automatically.
