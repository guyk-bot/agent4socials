import { MetadataRoute } from "next";
import { resolveAppBaseUrl } from "@/lib/app-base-url";
import { FUNNEL_FEATURE_PAGES } from "@/lib/funnel-feature-pages";

const baseUrl = resolveAppBaseUrl();

export default function sitemap(): MetadataRoute.Sitemap {
  const publicPaths: { path: string; changeFrequency: "weekly" | "monthly"; priority: number }[] = [
    { path: "", changeFrequency: "weekly", priority: 1 },
    { path: "/pricing", changeFrequency: "weekly", priority: 0.9 },
    { path: "/privacy", changeFrequency: "monthly", priority: 0.7 },
    { path: "/terms", changeFrequency: "monthly", priority: 0.7 },
    { path: "/data-deletion", changeFrequency: "monthly", priority: 0.7 },
    { path: "/login", changeFrequency: "monthly", priority: 0.7 },
    { path: "/signup", changeFrequency: "monthly", priority: 0.7 },
  ];

  const featurePaths = FUNNEL_FEATURE_PAGES.map((page) => ({
    url: `${baseUrl}/features/${page.slug}`,
    lastModified: new Date(),
    changeFrequency: "monthly" as const,
    priority: 0.75,
  }));

  return [
    ...publicPaths.map(({ path, changeFrequency, priority }) => ({
      url: `${baseUrl}${path}`,
      lastModified: new Date(),
      changeFrequency,
      priority,
    })),
    ...featurePaths,
  ];
}
