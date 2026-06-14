/**
 * Fetch and package app screens for inline display in iZop AI chat.
 */
import { prisma } from '@/lib/db';
import { parseBrandContextApiPayload } from '@/lib/brand-context-utils';
import {
  buildAllAccountsDashboardReports,
  buildCrossPlatformKpiSummary,
  buildDashboardAnalyticsReport,
  resolveDashboardDateRange,
} from '@/lib/ai/dashboard-analytics';
import { getDefaultAnalyticsDateRange } from '@/lib/calendar-date';
import {
  appViewArtifact,
  type AppViewId,
  type IzopArtifact,
  APP_VIEW_META,
} from '@/lib/ai/izop-artifacts';
import type { Platform } from '@prisma/client';

function brandContextFields(raw: unknown): Array<{ label: string; value: string }> {
  const c = parseBrandContextApiPayload(raw);
  const rows: Array<{ label: string; value: string }> = [];
  const add = (label: string, v: string | null | undefined) => {
    const t = String(v ?? '').trim();
    if (t) rows.push({ label, value: t });
  };
  add('Target audience', c.targetAudience);
  add('Tone of voice', c.toneOfVoice);
  add('Tone examples', c.toneExamples);
  add('Product or service', c.productDescription);
  add('Additional context', c.additionalContext);
  add('Inbox reply examples', c.inboxReplyExamples);
  add('Comment reply examples', c.commentReplyExamples);
  return rows;
}

function reportToArtifact(report: Awaited<ReturnType<typeof buildDashboardAnalyticsReport>>): IzopArtifact {
  return {
    type: 'report_snapshot',
    accountId: report.accountId,
    platform: report.platform,
    platformLabel: report.platformLabel,
    username: report.username,
    dateRange: report.dateRange,
    kpis: {
      followers: report.kpis.followers,
      newFollowers: report.kpis.newFollowers,
      views: report.kpis.views,
      engagement: report.kpis.engagement,
      posts: report.kpis.posts,
    },
    chartSeries: report.chartSeries,
    insightsHint: report.insightsHint,
  };
}

export async function runShowAppInChat(
  userId: string,
  args: {
    view: string;
    platform?: string;
    days?: number;
    since?: string;
    until?: string;
    accountId?: string;
  },
  helpers: {
    resolveAccountId: (args: Record<string, unknown>, opts?: { required?: boolean }) => Promise<string | null>;
    normalizePlatform: (input?: string) => Platform | null;
  }
): Promise<{ result: unknown; artifacts: IzopArtifact[] }> {
  const view = args.view as AppViewId;
  if (!APP_VIEW_META[view]) {
    throw new Error(
      `Unknown view "${args.view}". Use: ${Object.keys(APP_VIEW_META).join(', ')}`
    );
  }

  const dateRange =
    args.days || args.since || args.until
      ? resolveDashboardDateRange({ days: args.days, since: args.since, until: args.until })
      : getDefaultAnalyticsDateRange();

  const artifacts: IzopArtifact[] = [appViewArtifact(view)];
  const meta = APP_VIEW_META[view];

  switch (view) {
    case 'dashboard': {
      const platform = helpers.normalizePlatform(args.platform);
      if (platform || args.accountId) {
        const accountId = await helpers.resolveAccountId(
          { platform: args.platform, accountId: args.accountId },
          { required: true }
        );
        const report = await buildDashboardAnalyticsReport(userId, accountId!, dateRange);
        artifacts.push(reportToArtifact(report));
      }
      return { result: { view, dateRange, opened: meta.title }, artifacts };
    }

    case 'console': {
      const cross = await buildCrossPlatformKpiSummary(userId, dateRange);
      const reports = await buildAllAccountsDashboardReports(userId, dateRange);
      artifacts.push({
        type: 'console_summary',
        dateRange: cross.dateRange,
        kpi: {
          totalAudience: cross.kpi.totalAudience,
          totalImpressions: cross.kpi.totalImpressions,
          totalEngagement: cross.kpi.totalEngagement,
          totalPosts: cross.kpi.totalPosts,
        },
        href: meta.href,
      });
      artifacts.push(...reports.map(reportToArtifact));
      return { result: { view, kpi: cross.kpi, platformCount: reports.length }, artifacts };
    }

    case 'inbox':
      return { result: { view, hint: 'Open Inbox for live threads and replies.' }, artifacts };

    case 'composer': {
      return { result: { view }, artifacts };
    }

    case 'calendar':
    case 'posts_history': {
      const now = new Date();
      const scheduled = await prisma.post.findMany({
        where: {
          userId,
          OR: [
            { status: 'SCHEDULED', scheduledAt: { gte: now } },
            { status: 'POSTED', postedAt: { gte: new Date(now.getTime() - 30 * 86_400_000) } },
          ],
        },
        orderBy: { scheduledAt: 'asc' },
        take: 12,
        select: {
          id: true,
          content: true,
          title: true,
          scheduledAt: true,
          postedAt: true,
          status: true,
          targetPlatforms: true,
        },
      });
      const mapped = scheduled.map((p) => ({
        id: p.id,
        preview: (p.content ?? p.title ?? 'Scheduled post').slice(0, 120),
        scheduledAt: (p.scheduledAt ?? p.postedAt ?? p.scheduledAt)?.toISOString?.() ?? '',
        platforms: p.targetPlatforms ?? [],
        href: view === 'calendar' ? '/calendar' : `/posts`,
      }));
      if (mapped.length) {
        artifacts.push({
          type: 'scheduled_posts',
          posts: mapped,
          href: view === 'calendar' ? '/calendar' : '/posts',
        });
      } else {
        artifacts.push({
          type: 'text_block',
          title: 'No upcoming posts',
          body: 'Nothing scheduled in the next stretch. Open Composer to create one.',
          href: '/composer',
          hrefLabel: 'Open Composer',
        });
      }
      return { result: { view, count: mapped.length }, artifacts };
    }

    case 'reports':
      return {
        result: { view, hint: 'Use Reports to download PDF summaries for a date range.' },
        artifacts,
      };

    case 'smart_links': {
      const page = await prisma.linkPage.findUnique({
        where: { userId },
        include: { links: { where: { isVisible: true }, orderBy: { order: 'asc' }, take: 12 } },
      });
      artifacts.push({
        type: 'smart_links',
        slug: page?.slug ?? null,
        title: page?.title ?? null,
        isPublished: page?.isPublished ?? false,
        links: (page?.links ?? [])
          .filter((l) => l.label && l.url)
          .map((l) => ({ label: l.label!, url: l.url! })),
        publicUrl: page?.slug ? `/${page.slug}` : null,
        href: meta.href,
      });
      return { result: { view, linkCount: page?.links?.length ?? 0 }, artifacts };
    }

    case 'hashtag_pool':
      artifacts.push({
        type: 'text_block',
        title: 'Hashtag pool',
        body: 'Your saved hashtags live in the Hashtag pool page and Composer. Open it to view or edit tags.',
        href: meta.href,
        hrefLabel: meta.openLabel,
      });
      return { result: { view }, artifacts };

    case 'ai_assistant': {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { brandContext: true },
      });
      const fields = brandContextFields(user?.brandContext ?? null);
      if (fields.length) {
        artifacts.push({ type: 'brand_context', fields, href: meta.href });
      } else {
        artifacts.push({
          type: 'text_block',
          title: 'Brand context not set',
          body: 'Add your audience, tone, and product description in AI Assistant so drafts match your brand.',
          href: meta.href,
          hrefLabel: meta.openLabel,
        });
      }
      return { result: { view, fieldCount: fields.length }, artifacts };
    }

    case 'account': {
      const accounts = await prisma.socialAccount.findMany({
        where: { userId },
        select: { id: true, platform: true, username: true },
        orderBy: { createdAt: 'asc' },
      });
      artifacts.push({ type: 'accounts', accounts });
      return { result: { view, accounts }, artifacts };
    }

    default:
      return { result: { view }, artifacts };
  }
}
