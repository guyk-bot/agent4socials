import type { Metadata } from "next";

/** Bumped when tab favicon assets change (cache bust for browsers and CDNs). */
export const SITE_TAB_FAVICON_V = "27";

/** Tab / PWA icons. Shared so routes with their own `generateMetadata` still emit the same favicon links. */
export const siteTabIcons: NonNullable<Metadata["icons"]> = {
  icon: [
    { url: `/favicon-192.png?v=${SITE_TAB_FAVICON_V}`, sizes: "192x192", type: "image/png" },
    { url: `/favicon-128.png?v=${SITE_TAB_FAVICON_V}`, sizes: "128x128", type: "image/png" },
    { url: `/favicon-96.png?v=${SITE_TAB_FAVICON_V}`, sizes: "96x96", type: "image/png" },
    { url: `/favicon-48.png?v=${SITE_TAB_FAVICON_V}`, sizes: "48x48", type: "image/png" },
    { url: `/favicon.ico?v=${SITE_TAB_FAVICON_V}`, sizes: "any", type: "image/x-icon" },
    { url: `/a4s-tab.svg?v=${SITE_TAB_FAVICON_V}`, type: "image/svg+xml" },
  ],
  apple: [{ url: `/favicon-192.png?v=${SITE_TAB_FAVICON_V}`, sizes: "192x192", type: "image/png" }],
};
