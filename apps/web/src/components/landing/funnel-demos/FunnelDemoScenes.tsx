'use client';

import React from 'react';
import { CheckCircle2, Users } from 'lucide-react';
import {
  FacebookIcon,
  InstagramIcon,
  LinkedinIcon,
  PinterestIcon,
  ThreadsIcon,
  TikTokIcon,
  XTwitterIcon,
  YoutubeIcon,
} from '@/components/SocialPlatformIcons';
import {
  FunnelDemoAssistantBubble,
  FunnelDemoUserBubble,
  typewriterSlice,
} from './FunnelDemoFrame';

const USER_SCHEDULE =
  'Post this at 9:30 on all platforms';
const USER_REPLY = 'Reply to all of the last post comments';
const USER_BEST = 'What was my best post from the last week?';
const USER_LEADS = 'Send me the list of the leads';
const USER_TIKTOK =
  'Can you help me come up with new video ideas for TikTok shorts?';

const LEADS = [
  {
    name: 'Sarah Chen',
    intent: 'high' as const,
    comment: 'How much does this cost? Need this for my team.',
    outreach: 'Hey Sarah! Happy to share pricing — DM me or check the link in bio.',
  },
  {
    name: 'Mike Torres',
    intent: 'medium' as const,
    comment: 'Is this available in Europe?',
    outreach: 'Hi Mike — yes, we ship worldwide. Want me to send details?',
  },
];

export function FunnelDemoSceneSchedule({ progress }: { progress: number }) {
  const showAttach = progress > 0.08;
  const userText = typewriterSlice(USER_SCHEDULE, progress, 0.22, 0.58);
  const showUser = progress > 0.18;
  const showAssistant = progress > 0.62;

  return (
    <>
      <FunnelDemoUserBubble show={showUser}>
        {showAttach ? (
          <div className="mb-1.5 rounded-lg overflow-hidden border border-white/25 bg-black/20">
            <div className="relative aspect-video w-full bg-neutral-900">
              <div className="absolute inset-0 bg-gradient-to-br from-violet-900/40 to-neutral-900" />
              <div className="absolute bottom-1 left-1 rounded bg-black/60 px-1 py-0.5 text-[8px] text-white">
                launch-reel.mp4
              </div>
            </div>
          </div>
        ) : null}
        {userText}
        {progress > 0.18 && progress < 0.58 ? (
          <span className="inline-block w-px h-3 ml-0.5 bg-white/70 animate-pulse align-middle" />
        ) : null}
      </FunnelDemoUserBubble>
      <FunnelDemoAssistantBubble show={showAssistant}>
        <p className="text-neutral-700 dark:text-neutral-200 mb-1.5 text-[10px]">
          Scheduled for 9:30 AM across 8 platforms.
        </p>
        <div className="rounded-lg border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-950 p-2">
          <p className="text-[10px] font-semibold text-neutral-800 dark:text-neutral-100 mb-1.5">
            Multi-platform publish
          </p>
          <div className="grid grid-cols-4 gap-1.5">
            {[
              InstagramIcon,
              TikTokIcon,
              YoutubeIcon,
              FacebookIcon,
              XTwitterIcon,
              LinkedinIcon,
              ThreadsIcon,
              PinterestIcon,
            ].map((Icon, i) => (
              <span
                key={i}
                className="inline-flex h-6 w-6 items-center justify-center rounded bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700"
              >
                <Icon size={13} />
              </span>
            ))}
          </div>
          <p className="mt-1.5 text-[9px] text-emerald-600 dark:text-emerald-400 font-medium">
            Today · 9:30 AM · Auto publish
          </p>
        </div>
      </FunnelDemoAssistantBubble>
    </>
  );
}

export function FunnelDemoSceneComments({ progress }: { progress: number }) {
  const userText = typewriterSlice(USER_REPLY, progress, 0.1, 0.42);
  const showAssistant = progress > 0.48;

  return (
    <>
      <FunnelDemoUserBubble show={progress > 0.08}>
        {userText}
        {progress > 0.1 && progress < 0.42 ? (
          <span className="inline-block w-px h-3 ml-0.5 bg-white/70 animate-pulse align-middle" />
        ) : null}
      </FunnelDemoUserBubble>
      <FunnelDemoAssistantBubble show={showAssistant}>
        <div className="rounded-lg border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-900/80 p-1.5">
          <p className="font-medium text-neutral-800 dark:text-neutral-200 text-[9px] mb-1">
            Comments on: Summer launch Reel
          </p>
          <ul className="space-y-1">
            {['Love this!', 'Where can I buy?'].map((text, i) => (
              <li
                key={text}
                className="rounded border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 p-1"
              >
                <p className="text-[8px] text-neutral-600 dark:text-neutral-400">{text}</p>
                {(progress > 0.65 + i * 0.12 || progress >= 1) && (
                  <p className="mt-0.5 inline-flex items-center gap-0.5 text-[8px] text-emerald-700 dark:text-emerald-300">
                    <CheckCircle2 size={8} /> Reply sent
                  </p>
                )}
              </li>
            ))}
          </ul>
          <p className="mt-1 text-[8px] text-[var(--primary)] font-medium">847 replies sent in 4 min</p>
        </div>
      </FunnelDemoAssistantBubble>
    </>
  );
}

export function FunnelDemoSceneAnalytics({ progress }: { progress: number }) {
  const userText = typewriterSlice(USER_BEST, progress, 0.1, 0.4);
  const showAssistant = progress > 0.46;

  return (
    <>
      <FunnelDemoUserBubble show={progress > 0.08}>
        {userText}
        {progress > 0.1 && progress < 0.4 ? (
          <span className="inline-block w-px h-3 ml-0.5 bg-white/70 animate-pulse align-middle" />
        ) : null}
      </FunnelDemoUserBubble>
      <FunnelDemoAssistantBubble show={showAssistant}>
        <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 overflow-hidden">
          <div className="px-2 py-1 border-b border-neutral-100 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900/80">
            <p className="font-semibold text-[9px] text-neutral-900 dark:text-neutral-100">
              Instagram @yourbrand
            </p>
            <p className="text-[8px] text-neutral-500">Last 7 days</p>
          </div>
          <div className="grid grid-cols-3 gap-1 p-1.5">
            {[
              { label: 'Views', value: '124K' },
              { label: 'Engagement', value: '8.2K' },
              { label: 'Followers', value: '+412' },
            ].map((k) => (
              <div
                key={k.label}
                className="rounded border border-[var(--primary)] bg-[#E8F4FF]/60 dark:bg-[var(--primary)]/15 px-1 py-1"
              >
                <p className="text-[7px] uppercase text-neutral-500">{k.label}</p>
                <p className="text-[10px] font-bold text-neutral-900 dark:text-neutral-100">{k.value}</p>
              </div>
            ))}
          </div>
          <p className="px-2 pb-1.5 text-[8px] text-neutral-700 dark:text-neutral-300 leading-snug">
            Best post: <span className="font-semibold">Tuesday Reel</span> — 4.2× avg reach. Short video +
            question in caption drove saves.
          </p>
        </div>
      </FunnelDemoAssistantBubble>
    </>
  );
}

export function FunnelDemoSceneLeads({ progress }: { progress: number }) {
  const userText = typewriterSlice(USER_LEADS, progress, 0.1, 0.38);
  const showAssistant = progress > 0.44;

  return (
    <>
      <FunnelDemoUserBubble show={progress > 0.08}>
        {userText}
        {progress > 0.1 && progress < 0.38 ? (
          <span className="inline-block w-px h-3 ml-0.5 bg-white/70 animate-pulse align-middle" />
        ) : null}
      </FunnelDemoUserBubble>
      <FunnelDemoAssistantBubble show={showAssistant}>
        <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-1.5">
          <p className="flex items-center gap-1 font-semibold text-[9px] text-neutral-900 dark:text-neutral-100">
            <Users size={10} className="text-[var(--primary)]" />
            {LEADS.length} potential leads
          </p>
          <p className="text-[8px] text-neutral-500 mt-0.5">Scanned 847 comments · 1 high intent</p>
          <ul className="mt-1 space-y-1">
            {LEADS.map((l) => (
              <li
                key={l.name}
                className="rounded-lg border border-neutral-100 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800/50 p-1"
              >
                <div className="flex items-center justify-between gap-1">
                  <span className="text-[8px] font-medium text-neutral-800 dark:text-neutral-200 truncate">
                    {l.name}
                  </span>
                  <span
                    className={`shrink-0 rounded-full px-1 py-px text-[7px] font-semibold ${
                      l.intent === 'high'
                        ? 'bg-green-100 text-green-700 dark:bg-green-950/50 dark:text-green-300'
                        : 'bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300'
                    }`}
                  >
                    {l.intent}
                  </span>
                </div>
                <p className="text-[7px] italic text-neutral-500 line-clamp-1">&ldquo;{l.comment}&rdquo;</p>
              </li>
            ))}
          </ul>
        </div>
      </FunnelDemoAssistantBubble>
    </>
  );
}

export function FunnelDemoSceneTikTokIdeas({ progress }: { progress: number }) {
  const userText = typewriterSlice(USER_TIKTOK, progress, 0.08, 0.36);
  const showAssistant = progress > 0.42;

  return (
    <>
      <FunnelDemoUserBubble show={progress > 0.06}>
        {userText}
        {progress > 0.08 && progress < 0.36 ? (
          <span className="inline-block w-px h-3 ml-0.5 bg-white/70 animate-pulse align-middle" />
        ) : null}
      </FunnelDemoUserBubble>
      <FunnelDemoAssistantBubble show={showAssistant}>
        <p className="text-[8px] text-neutral-600 dark:text-neutral-300 mb-1">
          Your top TikTok from last month:
        </p>
        <div className="rounded-lg border border-neutral-200 dark:border-neutral-700 overflow-hidden mb-1">
          <div className="relative aspect-[9/16] max-h-[110px] w-full bg-neutral-900">
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
            <div className="absolute bottom-1 left-1 right-1">
              <p className="text-[8px] font-semibold text-white truncate">3 hooks that 10× my saves</p>
              <div className="flex gap-2 mt-0.5 text-[7px] text-white/90">
                <span>2.1M views</span>
                <span>184K likes</span>
              </div>
            </div>
          </div>
        </div>
        <p className="text-[8px] text-neutral-700 dark:text-neutral-200 leading-snug">
          Try a similar format: quick hook + on-screen text + CTA in the first 2 seconds. I can draft 3 scripts
          in your voice.
        </p>
      </FunnelDemoAssistantBubble>
    </>
  );
}

export function FunnelDemoSceneAdsRoas({ progress }: { progress: number }) {
  const showAssistant = progress > 0.2;

  return (
    <>
      <FunnelDemoUserBubble show={progress > 0.06}>
        {typewriterSlice('Compare Google, Meta and TikTok ad ROAS', progress, 0.06, 0.32)}
      </FunnelDemoUserBubble>
      <FunnelDemoAssistantBubble show={showAssistant}>
        <div className="relative rounded-lg border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-900 p-1.5">
          <div className="absolute top-1 right-1 rounded-full bg-neutral-900/90 px-1.5 py-0.5 text-[7px] font-semibold uppercase tracking-wide text-white z-10">
            Coming soon
          </div>
          <p className="text-[9px] font-semibold text-neutral-900 dark:text-neutral-100 mb-1 pr-14">
            Paid ads ROAS
          </p>
          <table className="w-full text-[8px]">
            <thead>
              <tr className="text-neutral-500 border-b border-neutral-200 dark:border-neutral-700">
                <th className="text-left py-0.5 font-medium">Platform</th>
                <th className="text-right py-0.5 font-medium">Spend</th>
                <th className="text-right py-0.5 font-medium">ROAS</th>
              </tr>
            </thead>
            <tbody className="text-neutral-800 dark:text-neutral-200">
              {[
                { name: 'Google', spend: '$2.4K', roas: '3.8×', hot: true },
                { name: 'Meta', spend: '$5.1K', roas: '2.9×', hot: false },
                { name: 'TikTok', spend: '$1.8K', roas: '4.2×', hot: true },
              ].map((row, i) => (
                <tr
                  key={row.name}
                  className={`border-b border-neutral-100 dark:border-neutral-800 ${
                    progress > 0.35 + i * 0.15 || progress >= 1 ? 'opacity-100' : 'opacity-30'
                  }`}
                >
                  <td className="py-0.5">{row.name}</td>
                  <td className="text-right py-0.5">{row.spend}</td>
                  <td
                    className={`text-right py-0.5 font-semibold ${
                      row.hot ? 'text-emerald-600 dark:text-emerald-400' : ''
                    }`}
                  >
                    {row.roas}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </FunnelDemoAssistantBubble>
    </>
  );
}

export const FUNNEL_DEMO_SCENE_COMPONENTS = [
  FunnelDemoSceneSchedule,
  FunnelDemoSceneComments,
  FunnelDemoSceneAnalytics,
  FunnelDemoSceneLeads,
  FunnelDemoSceneTikTokIdeas,
  FunnelDemoSceneAdsRoas,
] as const;
