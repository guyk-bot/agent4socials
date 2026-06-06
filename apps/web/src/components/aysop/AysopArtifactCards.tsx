'use client';

import React from 'react';
import Link from 'next/link';
import {
  BarChart2,
  Bot,
  Calendar,
  ExternalLink,
  Hash,
  Inbox,
  Link2,
  MessageSquare,
  PenSquare,
  Settings,
  Sparkles,
  Zap,
} from 'lucide-react';
import { formatMetricNumber } from '@/lib/metric-format';
import type { AysopArtifact, AppViewId } from '@/lib/ai/aysop-artifacts';
import { AysopAnalyticsReportCard } from '@/components/aysop/AysopAnalyticsReportCard';

const VIEW_ICONS: Partial<Record<AppViewId, React.ReactNode>> = {
  dashboard: <BarChart2 size={18} className="text-[var(--primary)]" />,
  console: <BarChart2 size={18} className="text-[var(--primary)]" />,
  inbox: <Inbox size={18} className="text-[var(--primary)]" />,
  composer: <PenSquare size={18} className="text-[var(--primary)]" />,
  calendar: <Calendar size={18} className="text-[var(--primary)]" />,
  automation: <Zap size={18} className="text-[var(--primary)]" />,
  smart_links: <Link2 size={18} className="text-[var(--primary)]" />,
  hashtag_pool: <Hash size={18} className="text-[var(--primary)]" />,
  ai_assistant: <Sparkles size={18} className="text-[var(--primary)]" />,
  account: <Settings size={18} className="text-[var(--primary)]" />,
  reports: <BarChart2 size={18} className="text-[var(--primary)]" />,
  posts_history: <MessageSquare size={18} className="text-[var(--primary)]" />,
};

function OpenLink({ href, label }: { href: string; label?: string }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--primary)] hover:underline mt-2"
    >
      {label ?? 'Open in app'} <ExternalLink size={14} />
    </Link>
  );
}

function AppViewCard({ artifact }: { artifact: Extract<AysopArtifact, { type: 'app_view' }> }) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-gradient-to-br from-white to-neutral-50 p-3 text-sm">
      <div className="flex items-start gap-2">
        <span className="mt-0.5 shrink-0">{VIEW_ICONS[artifact.viewId as AppViewId] ?? <Bot size={18} />}</span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-neutral-900">{artifact.title}</p>
          {artifact.description ? (
            <p className="text-neutral-600 text-xs mt-0.5">{artifact.description}</p>
          ) : null}
          <OpenLink href={artifact.href} label={artifact.openLabel ?? 'Open'} />
        </div>
      </div>
    </div>
  );
}

export function AysopArtifactCards({ artifacts }: { artifacts: AysopArtifact[] }) {
  if (!artifacts.length) return null;

  const rendered = new Set<string>();

  return (
    <div className="mt-3 space-y-2">
      {artifacts.map((a, i) => {
        const key = `${a.type}-${i}`;
        if (a.type === 'app_view') {
          const hasRicher = artifacts.some(
            (o, j) =>
              j !== i &&
              o.type !== 'app_view' &&
              o.type !== 'action_result' &&
              !rendered.has(`${o.type}-${j}`)
          );
          if (hasRicher) return null;
          return <AppViewCard key={key} artifact={a} />;
        }

        if (rendered.has(key)) return null;

        if (a.type === 'report_snapshot') {
          rendered.add(key);
          return <AysopAnalyticsReportCard key={key} report={a} />;
        }

        if (a.type === 'console_summary') {
          rendered.add(key);
          const k = a.kpi;
          return (
            <div key={key} className="rounded-xl border border-neutral-200 bg-white p-3 text-sm">
              <p className="font-semibold text-neutral-900 mb-1">Console overview</p>
              <p className="text-xs text-neutral-500 mb-3">
                {a.dateRange.start} to {a.dateRange.end}
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {[
                  { label: 'Audience', value: k.totalAudience },
                  { label: 'Impressions', value: k.totalImpressions },
                  { label: 'Engagement', value: k.totalEngagement },
                  { label: 'Posts', value: k.totalPosts },
                ].map((item) => (
                  <div key={item.label} className="rounded-lg bg-neutral-50 border border-neutral-100 px-2 py-2">
                    <p className="text-[10px] uppercase tracking-wide text-neutral-500">{item.label}</p>
                    <p className="font-bold text-neutral-900">{formatMetricNumber(item.value)}</p>
                  </div>
                ))}
              </div>
              <OpenLink href={a.href} label="Open Console" />
            </div>
          );
        }

        if (a.type === 'brand_context') {
          rendered.add(key);
          return (
            <div key={key} className="rounded-xl border border-neutral-200 bg-white p-3 text-sm max-h-64 overflow-y-auto">
              <p className="font-semibold text-neutral-900 mb-2">Brand context</p>
              <dl className="space-y-2">
                {a.fields.map((f) => (
                  <div key={f.label}>
                    <dt className="text-[10px] uppercase tracking-wide text-neutral-500">{f.label}</dt>
                    <dd className="text-neutral-700 whitespace-pre-wrap text-xs mt-0.5">{f.value}</dd>
                  </div>
                ))}
              </dl>
              <OpenLink href={a.href} label="Edit in AI Assistant" />
            </div>
          );
        }

        if (a.type === 'accounts') {
          rendered.add(key);
          return (
            <div key={key} className="rounded-xl border border-neutral-200 bg-neutral-50 p-3 text-sm">
              <p className="font-medium text-neutral-800 mb-2">Connected accounts</p>
              <div className="flex flex-wrap gap-1.5">
                {a.accounts.map((acc) => (
                  <span
                    key={acc.id}
                    className="text-xs px-2 py-1 rounded-full bg-white border border-neutral-200 text-neutral-700"
                  >
                    {acc.platform}
                    {acc.username ? ` @${acc.username}` : ''}
                  </span>
                ))}
              </div>
              <OpenLink href="/dashboard/account#connected-accounts" label="Manage accounts" />
            </div>
          );
        }

        if (a.type === 'posts') {
          rendered.add(key);
          return (
            <div key={key} className="rounded-xl border border-neutral-200 bg-white p-3 text-sm">
              <p className="font-medium text-neutral-800 mb-2">Recent posts</p>
              <ul className="space-y-2 max-h-52 overflow-y-auto">
                {a.posts.map((p, j) => (
                  <li key={j} className="border-l-2 border-[var(--primary)] pl-2">
                    <p className="text-neutral-800 line-clamp-2">{String(p.preview ?? 'Post')}</p>
                    <p className="text-[11px] text-neutral-500 mt-0.5">
                      {p.likes != null ? `${p.likes} likes` : ''}
                      {p.commentsCount != null ? ` · ${p.commentsCount} comments` : ''}
                      {p.impressions != null ? ` · ${p.impressions} views` : ''}
                    </p>
                  </li>
                ))}
              </ul>
              <OpenLink href="/dashboard" label="Open Dashboard posts" />
            </div>
          );
        }

        if (a.type === 'comments') {
          rendered.add(key);
          return (
            <div key={key} className="rounded-xl border border-neutral-200 bg-neutral-50 p-3 text-sm">
              <p className="font-medium text-neutral-800 mb-2">Comments on: {a.postPreview}</p>
              <ul className="space-y-2 max-h-48 overflow-y-auto">
                {a.comments.map((c, j) => (
                  <li key={j} className="border-l-2 border-[var(--primary)] pl-2">
                    <span className="font-medium text-neutral-700">{String(c.authorName ?? 'User')}</span>
                    <p className="text-neutral-600">{String(c.text ?? '')}</p>
                  </li>
                ))}
              </ul>
              <OpenLink href="/dashboard/inbox" label="Open Inbox" />
            </div>
          );
        }

        if (a.type === 'automation') {
          rendered.add(key);
          const steps = Array.isArray(a.keywordSteps) ? a.keywordSteps : [];
          return (
            <div key={key} className="rounded-xl border border-neutral-200 bg-white p-3 text-sm">
              <p className="font-medium text-neutral-800 mb-1">Keyword automation</p>
              <p className="text-xs text-neutral-500 mb-2">
                Welcome DM: {a.dmWelcomeEnabled ? 'On' : 'Off'} · {steps.length} keyword rule(s)
              </p>
              {steps.length > 0 ? (
                <ul className="space-y-1.5 max-h-40 overflow-y-auto text-xs">
                  {steps.map((s, j) => {
                    const step = s as { keyword?: string; replyTemplate?: string };
                    return (
                      <li key={j} className="rounded-lg bg-neutral-50 px-2 py-1.5 border border-neutral-100">
                        <span className="font-medium text-neutral-800">{String(step.keyword ?? 'Keyword')}</span>
                        <span className="text-neutral-500"> → {String(step.replyTemplate ?? '').slice(0, 80)}</span>
                      </li>
                    );
                  })}
                </ul>
              ) : null}
              <OpenLink href={a.href} label="Open Automation" />
            </div>
          );
        }

        if (a.type === 'scheduled_posts') {
          rendered.add(key);
          return (
            <div key={key} className="rounded-xl border border-neutral-200 bg-white p-3 text-sm">
              <p className="font-medium text-neutral-800 mb-2">Scheduled & recent posts</p>
              <ul className="space-y-2 max-h-48 overflow-y-auto">
                {a.posts.map((p) => (
                  <li key={p.id} className="rounded-lg border border-neutral-100 bg-neutral-50 px-2 py-1.5">
                    <p className="text-neutral-800 line-clamp-2 text-xs">{p.preview}</p>
                    <p className="text-[10px] text-neutral-500 mt-0.5">
                      {p.scheduledAt ? new Date(p.scheduledAt).toLocaleString() : ''}
                      {p.platforms.length ? ` · ${p.platforms.join(', ')}` : ''}
                    </p>
                  </li>
                ))}
              </ul>
              <OpenLink href={a.href} label="Open Calendar" />
            </div>
          );
        }

        if (a.type === 'smart_links') {
          rendered.add(key);
          return (
            <div key={key} className="rounded-xl border border-neutral-200 bg-white p-3 text-sm">
              <p className="font-medium text-neutral-800">{a.title ?? 'Smart Links page'}</p>
              <p className="text-xs text-neutral-500 mb-2">
                {a.isPublished ? 'Published' : 'Draft'}
                {a.publicUrl ? ` · ${a.publicUrl}` : ''}
              </p>
              {a.links.length > 0 ? (
                <ul className="space-y-1 text-xs max-h-36 overflow-y-auto">
                  {a.links.map((l, j) => (
                    <li key={j} className="flex justify-between gap-2">
                      <span className="text-neutral-800 truncate">{l.label}</span>
                      <span className="text-neutral-400 truncate">{l.url}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-neutral-500">No links yet.</p>
              )}
              <OpenLink href={a.href} label="Edit Smart Links" />
            </div>
          );
        }

        if (a.type === 'text_block') {
          rendered.add(key);
          return (
            <div key={key} className="rounded-xl border border-neutral-200 bg-neutral-50 p-3 text-sm">
              {a.title ? <p className="font-medium text-neutral-800 mb-1">{a.title}</p> : null}
              <p className="text-neutral-600 whitespace-pre-wrap">{a.body}</p>
              {a.href ? <OpenLink href={a.href} label={a.hrefLabel} /> : null}
            </div>
          );
        }

        if (a.type === 'composer_link') {
          rendered.add(key);
          return (
            <div key={key} className="rounded-xl border border-[var(--primary)]/30 bg-[#E8F4FF]/50 p-3 text-sm">
              <p className="font-medium text-neutral-800 mb-1">Draft ready for Composer</p>
              {a.caption ? <p className="text-neutral-600 whitespace-pre-wrap mb-2">{a.caption}</p> : null}
              <OpenLink href={a.url} label="Open Composer" />
            </div>
          );
        }

        if (a.type === 'action_result') {
          rendered.add(key);
          return (
            <div
              key={key}
              className={`rounded-xl border p-3 text-sm ${a.ok ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-red-200 bg-red-50'}`}
            >
              {a.detail}
            </div>
          );
        }

        return null;
      })}
    </div>
  );
}
