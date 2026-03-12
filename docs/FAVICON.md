# Favicon and logo for Google Search

The site uses the Agent4Socials **4S logo** (black background, magenta/cyan/white “4S”) for the favicon, app icon, and Google Search.

## Source files

- **Logo SVG:** `apps/web/public/logo.svg` — canonical logo. Use your design file (e.g. “4s logo 2.svg”) and copy it here when you update the logo.
- **App icon (Next):** `apps/web/src/app/icon.svg` — keep in sync with `public/logo.svg` if you use Next’s file-based icon.

## Generated PNGs (for Google and devices)

Google Search and Search Console work best with **PNG** favicons (48×48 recommended). The project generates:

- `apps/web/public/logo-48.png` — used as favicon and for `/favicon.ico` rewrite (Google, browsers).
- `apps/web/public/logo-192.png` — used for Apple touch icon, Open Graph, and Organization JSON-LD.

**Regenerate PNGs after changing the logo:**

```bash
cd apps/web && npm run generate-favicons
```

## Where it’s set

- **Layout:** `apps/web/src/app/layout.tsx`  
  - `metadata.icons`: primary icon is `logo-48.png` (48×48), with `logo.svg?v=3` as SVG fallback; Apple icon is `logo-192.png`.  
  - Bump the `?v=` on the SVG when you change the logo so caches refresh.
- **Favicon.ico:** `apps/web/next.config.ts` rewrites `/favicon.ico` to `/api/favicon`, which serves `logo-48.png`. There is no static `public/favicon.ico` (removing it ensures the rewrite is used and the 4S logo is shown).
- **Organization JSON-LD:** In `layout.tsx`, `organizationJsonLd.logo` points to `logo-192.png` (absolute URL) so Google can show the right brand in search and Knowledge Panel.
- **Manifest:** `apps/web/public/manifest.json` lists `logo-48.png`, `logo-192.png`, and `logo.svg?v=3`.

## Why the logo might not change right away

1. **Browser cache**  
   Hard refresh (Cmd+Shift+R / Ctrl+Shift+R) or use an incognito/private window.

2. **Google Search and Search Console**  
   Google caches favicons and can take days or weeks to update. To encourage a refresh:
   - [Google Search Console](https://search.google.com/search-console) → URL Inspection for your homepage (and for `https://yoursite.com/favicon.ico` if needed) → **Request indexing**.
   - Ensure the homepage and `/logo-48.png` (and `/favicon.ico`) are crawlable and return 200.

3. **After changing the logo**  
   - Replace `apps/web/public/logo.svg` with your new logo.
   - Regenerate `logo-48.png` and `logo-192.png` (see above).
   - In `layout.tsx`, bump the query param on the SVG (e.g. `?v=4`).
   - In `manifest.json`, bump the SVG `?v=` as well.
   - Redeploy so the new assets and metadata are live.

## Optional: favicon.ico as ICO

Some very old clients expect a real `.ico` file. The rewrite to `logo-48.png` is valid and works with Google; if you need a true ICO, export a 48×48 (or 32×32) `.ico` from your logo and add it to `apps/web/public/favicon.ico`, then adjust the rewrite in `next.config.ts` if desired.
