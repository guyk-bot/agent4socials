import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Omit turbopack config so Vercel uses default (avoids "turbopack.root should be absolute" warning)
  async rewrites() {
    return [
      // Serve our logo at /favicon.ico so Google and clients that request it get our brand, not Vercel's default.
      { source: "/favicon.ico", destination: "/logo.svg" },
    ];
  },
};

export default nextConfig;
