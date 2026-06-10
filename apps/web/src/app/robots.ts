import { MetadataRoute } from "next";
import { resolveAppBaseUrl } from "@/lib/app-base-url";

const baseUrl = resolveAppBaseUrl();

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
