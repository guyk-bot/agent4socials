import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    localPatterns: [{ pathname: "/logo-mark.png" }],
  },
  // Omit turbopack config so Vercel uses default (avoids "turbopack.root should be absolute" warning)
  async redirects() {
    return [{ source: '/dashboard/trending', destination: '/dashboard', permanent: false }];
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
      { source: "/logo.svg", headers: faviconCache },
      { source: "/logo-white.svg", headers: faviconCache },
    ];
  },
};

export default nextConfig;
