import { MetadataRoute } from "next";

const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://agent4socials.com";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: ["facebookexternalhit", "Facebot", "facebookcatalog"],
        allow: "/api/media/",
        disallow: [],
      },
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/dashboard/", "/accounts", "/calendar", "/composer", "/posts", "/settings", "/api/", "/auth/callback"],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
    host: baseUrl,
  };
}
