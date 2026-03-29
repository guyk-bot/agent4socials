import { MetadataRoute } from "next";

const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://agent4socials.com";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/dashboard/",
          "/accounts",
          "/calendar",
          "/composer",
          "/posts",
          "/settings",
          "/api/auth/",
          "/api/posts",
          "/api/social/",
          "/api/ai/",
          "/api/automation/",
          "/api/cron/",
          "/api/create-profile",
          "/api/debug/",
          "/api/env-check",
          "/auth/callback",
        ],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
    host: baseUrl,
  };
}
