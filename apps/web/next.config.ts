import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Omit turbopack config so Vercel uses default (avoids "turbopack.root should be absolute" warning)
  async rewrites() {
    return [
      { source: "/favicon.ico", destination: "/api/favicon" },
    ];
  },
};

export default nextConfig;
