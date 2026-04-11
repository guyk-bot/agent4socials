import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Omit turbopack config so Vercel uses default (avoids "turbopack.root should be absolute" warning)
  async redirects() {
    return [{ source: '/dashboard/trending', destination: '/dashboard', permanent: false }];
  },
};

export default nextConfig;
