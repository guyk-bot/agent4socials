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
  LifeBuoy,
  Lightbulb,
  Link2,
  MessageSquare,
  PenSquare,
  Settings,
  Sparkles,
  Users,
} from 'lucide-react';
import { formatMetricNumber } from '@/lib/metric-format';
import type { IzopArtifact, AppViewId } from '@/lib/ai/izop-artifacts';
import type { ComposerDraftPublishPatch } from '@/lib/ai/composer-draft-artifact-state';
import { IzopAnalyticsReportCard } from '@/components/izop/IzopAnalyticsReportCard';
import { IzopComposerPostDraftCard } from '@/components/izop/IzopComposerPostDraftCard';
import { IzopComposerSessionDraftCard } from '@/components/izop/IzopComposerSessionDraftCard';
import { ComposerOpenLink } from '@/components/izop/ComposerOpenLink';
import { IzopInChatCommentsCard } from '@/components/izop/IzopInChatCommentsCard';
import { IzopInChatConnectCard } from '@/components/izop/IzopInChatConnectCard';
import { IzopInChatInboxFeedCard } from '@/components/izop/IzopInChatInboxFeedCard';
import { IzopBrandContextUpdateCard } from '@/components/izop/IzopBrandContextUpdateCard';
import { IzopLeadsCard } from '@/components/izop/IzopLeadsCard';
import { IzopLeadsScanPromptCard } from '@/components/izop/IzopLeadsScanPromptCard';
import { PostContentPreviewThumb } from '@/components/PostContentPreviewThumb';
import { quickReplyMessageForAction } from '@/lib/ai/izop-quick-replies';
import { GlassButton } from '@/components/ui/GlassButton';

const SUPPORT_OPTIONS: Array<{ label: string; desc: string; href: string; icon: React.ReactNode }> = [
  {
    label: 'Send feedback',
    desc: 'Suggest a change or improvement.',
    href: '/dashboard/support?tab=feedback',
    icon: <Sparkles size={16} className="text-[var(--primary)]" />,
  },
  {
    label: 'Open a ticket',
    desc: 'Report an issue and get a reply by email.',
    href: '/dashboard/support?tab=ticket',
    icon: <MessageSquare size={16} className="text-[var(--primary)]" />,
  },
  {
    label: 'Schedule a 15 min Zoom call',
    desc: 'Pick a time that works for you.',
    href: '/dashboard/support?tab=zoom',
    icon: <Calendar size={16} className="text-[var(--primary)]" />,
  },
];

const VIEW_ICONS: Partial<Record<AppViewId, React.ReactNode>> = {
  dashboard: <BarChart2 size={18} className="text-[var(--primary)]" />,
  console: <BarChart2 size={18} className="text-[var(--primary)]" />,
  inbox: <Inbox size={18} className="text-[var(--primary)]" />,
  composer: <PenSquare size={18} className="text-[var(--primary)]" />,
  calendar: <Calendar size={18} className="text-[var(--primary)]" />,
  smart_links: <Link2 size={18} className="text-[var(--primary)]" />,
  hashtag_pool: <Hash size={18} className="text-[var(--primary)]" />,
  ai_assistant: <Sparkles size={18} className="text-[var(--primary)]" />,
  account: <Settings size={18} className="text-[var(--primary)]" />,
  reports: <BarChart2 size={18} className="text-[var(--primary)]" />,
  posts_history: <MessageSquare size={18} className="text-[var(--primary)]" />,
  brand: <Sparkles size={18} className="text-[var(--primary)]" />,
  leads: <Users size={18} className="text-[var(--primary)]" />,
  team: <Users size={18} className="text-[var(--primary)]" />,
  support: <LifeBuoy size={18} className="text-[var(--primary)]" />,
  brainstorm: <Lightbulb size={18} className="text-[var(--primary)]" />,
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

function AppViewCard({ artifact }: { artifact: Extract<IzopArtifact, { type: 'app_view' }> }) {
  return (
    <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-gradient-to-br from-white to-neutral-50 dark:from-neutral-900 dark:to-neutral-950 p-3 text-sm">
      <div className="flex items-start gap-2">
        <span className="mt-0.5 shrink-0">{VIEW_ICONS[artifact.viewId as AppViewId] ?? <Bot size={18} />}</span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-neutral-900 dark:text-neutral-100 dark:text-neutral-100">{artifact.title}</p>
          {artifact.description ? (
            <p className="text-neutral-600 dark:text-neutral-400 dark:text-neutral-400 text-xs mt-0.5">{artifact.description}</p>
          ) : null}
          <OpenLink href={artifact.href} label={artifact.openLabel ?? 'Open'} />
        </div>
      </div>
    </div>
  );
}

export function IzopArtifactCards({
  artifacts,
  messageId,
  onArtifactResolved,
  onScanLeads,
  scanningLeads,
  onQuickReply,
  quickReplyDisabled,
}: {
  artifacts: IzopArtifact[];
  messageId?: string;
  onArtifactResolved?: (
    artifactIndex: number,
    patch: {
      approvedAt?: string;
      dismissedAt?: string;
      resumeDismissedAt?: string;
    } & ComposerDraftPublishPatch
  ) => void;
  onScanLeads?: () => void;
  scanningLeads?: boolean;
  onQuickReply?: (message: string) => void;
  quickReplyDisabled?: boolean;
}) {
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
          return <IzopAnalyticsReportCard key={key} report={a} />;
        }

        if (a.type === 'console_summary') {
          rendered.add(key);
          const k = a.kpi;
          return (
            <div key={key} className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-3 text-sm">
              <p className="font-semibold text-neutral-900 dark:text-neutral-100 mb-1">Console overview</p>
              <p className="text-xs text-neutral-500 dark:text-neutral-400 mb-3">
                {a.dateRange.start} to {a.dateRange.end}
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {[
                  { label: 'Audience', value: k.totalAudience },
                  { label: 'Impressions', value: k.totalImpressions },
                  { label: 'Engagement', value: k.totalEngagement },
                  { label: 'Posts', value: k.totalPosts },
                ].map((item) => (
                  <div key={item.label} className="rounded-lg bg-neutral-50 dark:bg-neutral-800/60 border border-neutral-100 dark:border-neutral-700 px-2 py-2">
                    <p className="text-[10px] uppercase tracking-wide text-neutral-500 dark:text-neutral-400">{item.label}</p>
                    <p className="font-bold text-neutral-900 dark:text-neutral-100">{formatMetricNumber(item.value)}</p>
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
            <div key={key} className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-3 text-sm max-h-64 overflow-y-auto">
              <p className="font-semibold text-neutral-900 dark:text-neutral-100 mb-2">Brand context</p>
              <dl className="space-y-2">
                {a.fields.map((f) => (
                  <div key={f.label}>
                    <dt className="text-[10px] uppercase tracking-wide text-neutral-500 dark:text-neutral-400">{f.label}</dt>
                    <dd className="text-neutral-700 dark:text-neutral-300 whitespace-pre-wrap text-xs mt-0.5">{f.value}</dd>
                  </div>
                ))}
              </dl>
              <OpenLink href={a.href} label="Open Brand" />
            </div>
          );
        }

        if (a.type === 'brand_context_update') {
          rendered.add(key);
          return (
            <IzopBrandContextUpdateCard
              key={key}
              artifact={a}
              messageId={messageId ?? `msg-${i}`}
              artifactIndex={i}
              onArtifactResolved={
                onArtifactResolved ? (patch) => onArtifactResolved(i, patch) : undefined
              }
              onQuickReply={onQuickReply}
              quickReplyDisabled={quickReplyDisabled}
            />
          );
        }

        if (a.type === 'interactive_card') {
          rendered.add(key);
          const title = a.title?.trim();
          const body = a.body?.trim();
          return (
            <div key={key} className="mt-2">
              {title ? (
                <p className="font-medium text-neutral-900 dark:text-neutral-100 mb-1">{title}</p>
              ) : null}
              {body ? (
                <p className="text-sm text-neutral-700 dark:text-neutral-300 mb-2 whitespace-pre-line">{body}</p>
              ) : null}
              <div className="flex flex-wrap gap-2">
                {a.actions.map((action, actionIndex) => {
                  const reply = quickReplyMessageForAction(action.action);
                  return (
                    <GlassButton
                      key={actionIndex}
                      variant={action.style === 'primary' ? 'primary' : 'secondary'}
                      size="md"
                      disabled={quickReplyDisabled || !reply || !onQuickReply}
                      onClick={() => {
                        if (reply && onQuickReply) onQuickReply(reply);
                      }}
                    >
                      {action.label}
                    </GlassButton>
                  );
                })}
              </div>
            </div>
          );
        }

        if (a.type === 'leads') {
          rendered.add(key);
          return <IzopLeadsCard key={key} artifact={a} onScanLeads={onScanLeads} scanning={scanningLeads} />;
        }

        if (a.type === 'leads_scan_prompt') {
          rendered.add(key);
          return (
            <IzopLeadsScanPromptCard
              key={key}
              artifact={a}
              onScanLeads={onScanLeads}
              scanning={scanningLeads}
            />
          );
        }

        if (a.type === 'support_options') {
          rendered.add(key);
          return (
            <div key={key} className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-3 text-sm">
              <p className="flex items-center gap-1.5 font-semibold text-neutral-900 dark:text-neutral-100">
                <LifeBuoy size={15} className="text-[var(--primary)]" /> How can we help?
              </p>
              <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">
                Pick an option and we will take care of it.
              </p>
              <div className="mt-3 space-y-2">
                {SUPPORT_OPTIONS.map((opt) => (
                  <Link
                    key={opt.href}
                    href={opt.href}
                    className="flex items-start gap-2.5 rounded-lg border border-neutral-100 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800/50 px-3 py-2.5 hover:border-[var(--primary)]/40 hover:bg-[var(--primary)]/5 transition-colors"
                  >
                    <span className="mt-0.5 shrink-0">{opt.icon}</span>
                    <span className="min-w-0">
                      <span className="block font-medium text-neutral-800 dark:text-neutral-200">{opt.label}</span>
                      <span className="block text-xs text-neutral-500 dark:text-neutral-400">{opt.desc}</span>
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          );
        }

        if (a.type === 'brand_workspaces') {
          rendered.add(key);
          return (
            <div key={key} className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900/80 p-3 text-sm space-y-3">
              <p className="font-medium text-neutral-800 dark:text-neutral-200">Brand workspaces</p>
              {a.workspaces.map((w) => (
                <div key={w.id} className="rounded-lg bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 p-3">
                  <p className="font-semibold text-neutral-900 dark:text-neutral-100">{w.name}</p>
                  <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
                    {w.connectedAccountCount} connected account{w.connectedAccountCount === 1 ? '' : 's'}
                  </p>
                  {w.accounts.length ? (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {w.accounts.map((acc, j) => (
                        <span
                          key={`${w.id}-${acc.platform}-${j}`}
                          className="text-xs px-2 py-1 rounded-full bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-neutral-700 dark:text-neutral-300"
                        >
                          {acc.platform}
                          {acc.username ? ` @${acc.username}` : ''}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
              ))}
              <OpenLink href={a.href} label="Manage brands" />
            </div>
          );
        }

        if (a.type === 'accounts') {
          rendered.add(key);
          return (
            <div key={key} className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900/80 p-3 text-sm">
              <p className="font-medium text-neutral-800 dark:text-neutral-200 mb-2">Connected accounts</p>
              <div className="flex flex-wrap gap-1.5">
                {a.accounts.map((acc) => (
                  <span
                    key={acc.id}
                    className="text-xs px-2 py-1 rounded-full bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-neutral-700 dark:text-neutral-300 dark:text-neutral-300"
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
            <div key={key} className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-3 text-sm">
              <p className="font-medium text-neutral-800 dark:text-neutral-200 mb-2">Recent posts</p>
              <ul className="space-y-2 max-h-52 overflow-y-auto">
                {a.posts.map((p, j) => {
                  const permalink = typeof p.permalinkUrl === 'string' ? p.permalinkUrl.trim() : '';
                  const row = (
                    <div className="flex gap-2.5 min-w-0">
                      <PostContentPreviewThumb
                        platform={a.platform ?? null}
                        mediaType={typeof p.mediaType === 'string' ? p.mediaType : null}
                        thumbnailUrl={typeof p.thumbnailUrl === 'string' ? p.thumbnailUrl : null}
                        className="w-12 h-12"
                        imgClassName="w-12 h-12 rounded-lg object-cover shrink-0"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-neutral-800 dark:text-neutral-200 line-clamp-2">{String(p.preview ?? 'Post')}</p>
                        <p className="text-[11px] text-neutral-500 dark:text-neutral-400 mt-0.5">
                          {p.likes != null ? `${p.likes} likes` : ''}
                          {p.commentsCount != null ? ` · ${p.commentsCount} comments` : ''}
                          {p.impressions != null ? ` · ${p.impressions} views` : ''}
                        </p>
                      </div>
                    </div>
                  );
                  return (
                    <li key={j} className="border-l-2 border-[var(--primary)] pl-2">
                      {permalink ? (
                        <a
                          href={permalink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block rounded-lg hover:bg-neutral-50 dark:hover:bg-neutral-800/60 -mx-1 px-1 py-0.5 transition-colors"
                        >
                          {row}
                        </a>
                      ) : (
                        row
                      )}
                    </li>
                  );
                })}
              </ul>
              <OpenLink href="/dashboard" label="Open Dashboard posts" />
            </div>
          );
        }

        if (a.type === 'comments') {
          rendered.add(key);
          return <IzopInChatCommentsCard key={key} artifact={a} />;
        }

        if (a.type === 'inbox_feed') {
          rendered.add(key);
          return <IzopInChatInboxFeedCard key={key} artifact={a} />;
        }

        if (a.type === 'connect_platforms') {
          rendered.add(key);
          return <IzopInChatConnectCard key={key} artifact={a} />;
        }

        if (a.type === 'scheduled_posts') {
          rendered.add(key);
          return (
            <div key={key} className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-3 text-sm">
              <p className="font-medium text-neutral-800 dark:text-neutral-200 mb-2">Scheduled & recent posts</p>
              <ul className="space-y-2 max-h-48 overflow-y-auto">
                {a.posts.map((p) => (
                  <li key={p.id} className="rounded-lg border border-neutral-100 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800/60 px-2 py-1.5">
                    <p className="text-neutral-800 dark:text-neutral-200 line-clamp-2 text-xs">{p.preview}</p>
                    <p className="text-[10px] text-neutral-500 dark:text-neutral-400 mt-0.5">
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
            <div key={key} className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-3 text-sm">
              <p className="font-medium text-neutral-800 dark:text-neutral-200">{a.title ?? 'Smart Links page'}</p>
              <p className="text-xs text-neutral-500 dark:text-neutral-400 mb-2">
                {a.isPublished ? 'Published' : 'Draft'}
                {a.publicUrl ? ` · ${a.publicUrl}` : ''}
              </p>
              {a.links.length > 0 ? (
                <ul className="space-y-1 text-xs max-h-36 overflow-y-auto">
                  {a.links.map((l, j) => (
                    <li key={j} className="flex justify-between gap-2">
                      <span className="text-neutral-800 dark:text-neutral-200 truncate">{l.label}</span>
                      <span className="text-neutral-400 truncate">{l.url}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-neutral-500 dark:text-neutral-400">No links yet.</p>
              )}
              <OpenLink href={a.href} label="Edit Smart Links" />
            </div>
          );
        }

        if (a.type === 'text_block') {
          rendered.add(key);
          return (
            <div key={key} className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900/80 p-3 text-sm">
              {a.title ? <p className="font-medium text-neutral-800 dark:text-neutral-200 mb-1">{a.title}</p> : null}
              <p className="text-neutral-600 dark:text-neutral-400 whitespace-pre-wrap">{a.body}</p>
              {a.href ? <OpenLink href={a.href} label={a.hrefLabel} /> : null}
            </div>
          );
        }

        if (a.type === 'composer_session_draft') {
          rendered.add(key);
          return <IzopComposerSessionDraftCard key={key} draft={a} />;
        }

        if (a.type === 'composer_post_draft') {
          const prevIsDraft = i > 0 && artifacts[i - 1]?.type === 'composer_post_draft';
          if (prevIsDraft) return null;

          const draftRun = artifacts.slice(i).filter((item): item is Extract<IzopArtifact, { type: 'composer_post_draft' }> => item.type === 'composer_post_draft');
          draftRun.forEach((_, j) => rendered.add(`composer_post_draft-${i + j}`));

          return (
            <div key={key} className="space-y-2">
              {draftRun.map((draft, j) => (
                <IzopComposerPostDraftCard
                  key={`${key}-${j}`}
                  draft={draft}
                  messageId={messageId}
                  artifactIndex={i + j}
                  onArtifactResolved={
                    onArtifactResolved
                      ? (patch) => onArtifactResolved(i + j, patch)
                      : undefined
                  }
                />
              ))}
            </div>
          );
        }

        if (a.type === 'composer_link') {
          rendered.add(key);
          return (
            <div key={key} className="rounded-xl border border-[var(--primary)]/30 bg-[#E8F4FF]/50 dark:bg-[var(--primary)]/10 p-3 text-sm">
              <p className="font-medium text-neutral-800 dark:text-neutral-200 mb-1">
                {a.platform ? `Draft for ${a.platform}` : 'Draft ready for Composer'}
              </p>
              {a.caption ? <p className="text-neutral-600 dark:text-neutral-400 whitespace-pre-wrap mb-2">{a.caption}</p> : null}
              <ComposerOpenLink href={a.url} draft={a.draft ?? null} label="Open Composer" />
            </div>
          );
        }

        if (a.type === 'action_result') {
          rendered.add(key);
          return (
            <div
              key={key}
              className={`rounded-xl border p-3 text-sm ${a.ok ? 'border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-200' : 'border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/40 dark:text-red-200'}`}
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
