import { MetadataRoute } from "next";

const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://agent4socials.com";

export default function sitemap(): MetadataRoute.Sitemap {
  const publicPaths: { path: string; changeFrequency: "weekly" | "monthly"; priority: number }[] = [
    { path: "", changeFrequency: "weekly", priority: 1 },
    { path: "/pricing", changeFrequency: "weekly", priority: 0.9 },
    { path: "/privacy", changeFrequency: "monthly", priority: 0.7 },
    { path: "/terms", changeFrequency: "monthly", priority: 0.7 },
    { path: "/login", changeFrequency: "monthly", priority: 0.7 },
    { path: "/signup", changeFrequency: "monthly", priority: 0.7 },
  ];

  return publicPaths.map(({ path, changeFrequency, priority }) => ({
    url: `${baseUrl}${path}`,
    lastModified: new Date(),
    changeFrequency,
    priority,
  }));
}
