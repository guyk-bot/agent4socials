import type { Metadata } from "next";

/** Bumped when tab favicon assets change (cache bust for browsers and CDNs). */
export const SITE_TAB_FAVICON_V = "51";

/** Tab / PWA icons. Rounded black-square mark; PNG first so browsers pick the full logo. */
export const siteTabIcons: NonNullable<Metadata["icons"]> = {
  icon: [
    { url: `/favicon-192.png?v=${SITE_TAB_FAVICON_V}`, sizes: "192x192", type: "image/png" },
    { url: `/favicon-128.png?v=${SITE_TAB_FAVICON_V}`, sizes: "128x128", type: "image/png" },
    { url: `/favicon-96.png?v=${SITE_TAB_FAVICON_V}`, sizes: "96x96", type: "image/png" },
    { url: `/favicon-48.png?v=${SITE_TAB_FAVICON_V}`, sizes: "48x48", type: "image/png" },
    { url: `/favicon.ico?v=${SITE_TAB_FAVICON_V}`, sizes: "any", type: "image/x-icon" },
  ],
  apple: [{ url: `/favicon-192.png?v=${SITE_TAB_FAVICON_V}`, sizes: "192x192", type: "image/png" }],
};
