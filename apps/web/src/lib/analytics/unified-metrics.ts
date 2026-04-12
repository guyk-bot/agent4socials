import { prisma } from '@/lib/db';

// ─── Interfaces ───────────────────────────────────────────────────────────────

export interface UnifiedKpiSummary {
  totalAudience: number;
  totalImpressions: number;
  totalEngagement: number;
  totalPosts: number;
  audienceGrowthPercentage: number;
  impressionsGrowthPercentage: number;
  engagementGrowthPercentage: number;
  postsGrowthPercentage: number;
}

export interface UnifiedChartPoint {
  date: string;
  Instagram: number;
  Meta: number;
  X: number;
  LinkedIn: number;
  YouTube: number;
  TikTok: number;
  Pinterest: number;
  [key: string]: string | number;
}

export type UnifiedChartData = UnifiedChartPoint[];

export interface UnifiedTopPost {
  id: string;
  platform: string;
  caption: string;
  url: string | null;
  thumbnailUrl: string | null;
  totalEngagement: number;
  impressions: number;
  likes: number;
  comments: number;
  shares: number;
  postedAt: string;
}

export interface UnifiedHistoryPost {
  id: string;
  platform: string;
  caption: string;
  url: string | null;
  thumbnailUrl: string | null;
  likes: number;
  comments: number;
  shares: number;
  impressions: number;
  totalEngagement: number;
  postedAt: string;
  mediaType: string | null;
}

export interface UnifiedSummaryResponse {
  kpi: UnifiedKpiSummary;
  chart: UnifiedChartData;
  topPosts: UnifiedTopPost[];
  history: UnifiedHistoryPost[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export const PLATFORM_LABEL: Record<string, string> = {
  INSTAGRAM: 'Instagram',
  FACEBOOK: 'Meta',
  TWITTER: 'X',
  LINKEDIN: 'LinkedIn',
  YOUTUBE: 'YouTube',
  TIKTOK: 'TikTok',
  PINTEREST: 'Pinterest',
};

export const PLATFORM_COLOR: Record<string, string> = {
  Instagram: '#e1306c',
  Meta: '#1877f2',
  X: '#5b7fa6',
  LinkedIn: '#0a66c2',
  YouTube: '#ff0000',
  TikTok: '#69c9d0',
  Pinterest: '#e60023',
};

export const CHART_PLATFORMS = ['Instagram', 'Meta', 'X', 'LinkedIn', 'YouTube', 'TikTok', 'Pinterest'] as const;

function growthPct(current: number, previous: number): number {
  if (previous === 0) return current > 0 ? 100 : 0;
  return ((current - previous) / previous) * 100;
}

function periodBounds(days: number): { since: Date; until: Date; prevSince: Date; prevUntil: Date } {
  const until = new Date();
  const since = new Date();
  since.setDate(since.getDate() - days);
  const prevUntil = new Date(since);
  prevUntil.setDate(prevUntil.getDate() - 1);
  const prevSince = new Date(prevUntil);
  prevSince.setDate(prevSince.getDate() - days);
  return { since, until, prevSince, prevUntil };
}

function sumEngagement(p: {
  likeCount: number | null;
  commentsCount: number | null;
  sharesCount: number | null;
  repostsCount: number | null;
}): number {
  return (p.likeCount ?? 0) + (p.commentsCount ?? 0) + (p.sharesCount ?? 0) + (p.repostsCount ?? 0);
}

// ─── KPI Summary ─────────────────────────────────────────────────────────────

export async function getUnifiedKpiSummary(userId: string, days: number): Promise<UnifiedKpiSummary> {
  const { since, until, prevSince, prevUntil } = periodBounds(days);

  // Latest follower count per social account (most recent snapshot overall)
  const allSnapshots = await prisma.accountMetricSnapshot.findMany({
    where: { userId },
    select: { socialAccountId: true, followersCount: true, fansCount: true, metricDate: true },
    orderBy: { metricDate: 'desc' },
  });

  const seenAccounts = new Set<string>();
  const seenStartAccounts = new Set<string>();
  let totalAudience = 0;
  let startAudience = 0;
  const sinceDateStr = since.toISOString().slice(0, 10);

  for (const s of allSnapshots) {
    if (!seenAccounts.has(s.socialAccountId)) {
      seenAccounts.add(s.socialAccountId);
      totalAudience += s.followersCount ?? s.fansCount ?? 0;
    }
    if (s.metricDate <= sinceDateStr && !seenStartAccounts.has(s.socialAccountId)) {
      seenStartAccounts.add(s.socialAccountId);
      startAudience += s.followersCount ?? s.fansCount ?? 0;
    }
  }

  // Current period posts
  const [currentPosts, prevPosts, linkedinCurrent, linkedinPrev] = await Promise.all([
    prisma.importedPost.findMany({
      where: { socialAccount: { userId }, publishedAt: { gte: since, lte: until } },
      select: {
        impressions: true,
        likeCount: true,
        commentsCount: true,
        sharesCount: true,
        repostsCount: true,
      },
    }),
    prisma.importedPost.findMany({
      where: { socialAccount: { userId }, publishedAt: { gte: prevSince, lte: prevUntil } },
      select: {
        impressions: true,
        likeCount: true,
        commentsCount: true,
        sharesCount: true,
        repostsCount: true,
      },
    }),
    prisma.postPerformance.findMany({
      where: { userId, fetchedAt: { gte: since, lte: until } },
      select: { impressions: true, comments: true, shares: true },
    }),
    prisma.postPerformance.findMany({
      where: { userId, fetchedAt: { gte: prevSince, lte: prevUntil } },
      select: { impressions: true, comments: true, shares: true },
    }),
  ]);

  const totalImpressions =
    currentPosts.reduce((s, p) => s + (p.impressions ?? 0), 0) +
    linkedinCurrent.reduce((s, p) => s + (p.impressions ?? 0), 0);
  const totalEngagement =
    currentPosts.reduce((s, p) => s + sumEngagement(p), 0) +
    linkedinCurrent.reduce((s, p) => s + (p.comments ?? 0) + (p.shares ?? 0), 0);
  const totalPosts = currentPosts.length + linkedinCurrent.length;

  const prevImpressions =
    prevPosts.reduce((s, p) => s + (p.impressions ?? 0), 0) +
    linkedinPrev.reduce((s, p) => s + (p.impressions ?? 0), 0);
  const prevEngagement =
    prevPosts.reduce((s, p) => s + sumEngagement(p), 0) +
    linkedinPrev.reduce((s, p) => s + (p.comments ?? 0) + (p.shares ?? 0), 0);
  const prevPostsCount = prevPosts.length + linkedinPrev.length;

  return {
    totalAudience,
    totalImpressions,
    totalEngagement,
    totalPosts,
    audienceGrowthPercentage: growthPct(totalAudience, startAudience),
    impressionsGrowthPercentage: growthPct(totalImpressions, prevImpressions),
    engagementGrowthPercentage: growthPct(totalEngagement, prevEngagement),
    postsGrowthPercentage: growthPct(totalPosts, prevPostsCount),
  };
}

// ─── Chart Data ───────────────────────────────────────────────────────────────

export async function getUnifiedChartData(userId: string, days: number): Promise<UnifiedChartData> {
  const { since, until } = periodBounds(days);

  const [posts, linkedinPosts] = await Promise.all([
    prisma.importedPost.findMany({
      where: { socialAccount: { userId }, publishedAt: { gte: since, lte: until } },
      select: { publishedAt: true, impressions: true, platform: true },
      orderBy: { publishedAt: 'asc' },
    }),
    prisma.postPerformance.findMany({
      where: { userId, fetchedAt: { gte: since, lte: until } },
      select: { fetchedAt: true, impressions: true },
    }),
  ]);

  // Build a complete date axis so every day in the range is represented
  const emptyPoint = (): UnifiedChartPoint => ({
    date: '',
    Instagram: 0,
    Meta: 0,
    X: 0,
    LinkedIn: 0,
    YouTube: 0,
    TikTok: 0,
    Pinterest: 0,
  });

  const dateMap: Record<string, UnifiedChartPoint> = {};
  const cursor = new Date(since);
  while (cursor <= until) {
    const d = cursor.toISOString().slice(0, 10);
    dateMap[d] = { ...emptyPoint(), date: d };
    cursor.setDate(cursor.getDate() + 1);
  }

  for (const post of posts) {
    const d = new Date(post.publishedAt).toISOString().slice(0, 10);
    const label = PLATFORM_LABEL[post.platform ?? ''] ?? null;
    if (label && dateMap[d] && label in dateMap[d]) {
      (dateMap[d] as Record<string, number>)[label] += post.impressions ?? 0;
    }
  }

  for (const pp of linkedinPosts) {
    const d = new Date(pp.fetchedAt).toISOString().slice(0, 10);
    if (dateMap[d]) dateMap[d].LinkedIn += pp.impressions ?? 0;
  }

  return Object.values(dateMap).sort((a, b) => a.date.localeCompare(b.date));
}

// ─── Top Posts ────────────────────────────────────────────────────────────────

export async function getUnifiedTopPosts(userId: string, days: number, limit = 5): Promise<UnifiedTopPost[]> {
  const { since, until } = periodBounds(days);

  const posts = await prisma.importedPost.findMany({
    where: { socialAccount: { userId }, publishedAt: { gte: since, lte: until } },
    select: {
      id: true,
      content: true,
      permalinkUrl: true,
      thumbnailUrl: true,
      impressions: true,
      likeCount: true,
      commentsCount: true,
      sharesCount: true,
      repostsCount: true,
      publishedAt: true,
      platform: true,
    },
    orderBy: [{ likeCount: 'desc' }, { impressions: 'desc' }],
    take: limit * 4,
  });

  return posts
    .map((p) => ({
      id: p.id,
      platform: PLATFORM_LABEL[p.platform ?? ''] ?? (p.platform ?? 'Unknown'),
      caption: p.content ?? '',
      url: p.permalinkUrl,
      thumbnailUrl: p.thumbnailUrl,
      totalEngagement: sumEngagement(p),
      impressions: p.impressions ?? 0,
      likes: p.likeCount ?? 0,
      comments: p.commentsCount ?? 0,
      shares: (p.sharesCount ?? 0) + (p.repostsCount ?? 0),
      postedAt: p.publishedAt.toISOString(),
    }))
    .sort((a, b) => b.totalEngagement - a.totalEngagement)
    .slice(0, limit);
}

// ─── Combined History ─────────────────────────────────────────────────────────

export async function getUnifiedPostsHistory(
  userId: string,
  days: number,
  limit = 60
): Promise<UnifiedHistoryPost[]> {
  const { since, until } = periodBounds(days);

  const posts = await prisma.importedPost.findMany({
    where: { socialAccount: { userId }, publishedAt: { gte: since, lte: until } },
    select: {
      id: true,
      content: true,
      permalinkUrl: true,
      thumbnailUrl: true,
      impressions: true,
      likeCount: true,
      commentsCount: true,
      sharesCount: true,
      repostsCount: true,
      publishedAt: true,
      platform: true,
      mediaType: true,
    },
    orderBy: { publishedAt: 'desc' },
    take: limit,
  });

  return posts.map((p) => ({
    id: p.id,
    platform: PLATFORM_LABEL[p.platform ?? ''] ?? (p.platform ?? 'Unknown'),
    caption: p.content ?? '',
    url: p.permalinkUrl,
    thumbnailUrl: p.thumbnailUrl,
    likes: p.likeCount ?? 0,
    comments: p.commentsCount ?? 0,
    shares: (p.sharesCount ?? 0) + (p.repostsCount ?? 0),
    impressions: p.impressions ?? 0,
    totalEngagement: sumEngagement(p),
    postedAt: p.publishedAt.toISOString(),
    mediaType: p.mediaType,
  }));
}
