import type { NextConfig } from "next";

/** Keep in sync with src/lib/app-base-url.ts (inlined so Vercel can load next.config). */
const CANONICAL_APP_ORIGIN = "https://www.izop.ai";
const LEGACY_APP_HOSTS = [
  "agent4socials.com",
  "www.agent4socials.com",
  "izop.io",
  "www.izop.io",
  "izop.app",
  "www.izop.app",
] as const;

const legacyHostRedirects = LEGACY_APP_HOSTS.map((host) => ({
  source: "/:path*",
  has: [{ type: "host" as const, value: host }],
  destination: `${CANONICAL_APP_ORIGIN}/:path*`,
  permanent: true,
}));

const nextConfig: NextConfig = {
  images: {
    localPatterns: [{ pathname: "/logo-mark.png" }, { pathname: "/logo-mark-dark.png" }],
  },
  // Omit turbopack config so Vercel uses default (avoids "turbopack.root should be absolute" warning)
  async redirects() {
    return [
      ...legacyHostRedirects,
      { source: '/dashboard/trending', destination: '/dashboard', permanent: false },
      { source: '/preview/fonts', destination: '/font-preview', permanent: false },
    ];
  },
  /** Favicons are aggressively cached; encourage revalidation after asset swaps. */
  async headers() {
    const faviconCache = [{ key: "Cache-Control", value: "public, max-age=0, must-revalidate" }];
    return [
      { source: "/favicon.ico", headers: faviconCache },
      { source: "/favicon.svg", headers: faviconCache },
      { source: "/a4s-tab.svg", headers: faviconCache },
      { source: "/favicon-source-mark.png", headers: faviconCache },
      { source: "/google-search-logo-source.png", headers: faviconCache },
      { source: "/favicon-192.png", headers: faviconCache },
      { source: "/favicon-128.png", headers: faviconCache },
      { source: "/favicon-96.png", headers: faviconCache },
      { source: "/favicon-48.png", headers: faviconCache },
      { source: "/logo-48.png", headers: faviconCache },
      { source: "/logo-192.png", headers: faviconCache },
      { source: "/logo-mark.png", headers: faviconCache },
      { source: "/logo-mark-dark.png", headers: faviconCache },
      { source: "/logo.svg", headers: faviconCache },
      { source: "/logo-white.svg", headers: faviconCache },
    ];
  },
};

export default nextConfig;
