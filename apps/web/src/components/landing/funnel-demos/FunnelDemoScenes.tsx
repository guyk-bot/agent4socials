'use client';

import React from 'react';
import { CheckCircle2 } from 'lucide-react';
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
import {
  FUNNEL_DEMO_BRAINSTORM_WINNER_SRC,
  FUNNEL_DEMO_POST_VIDEO_SRC,
} from './funnel-demo-assets';
import {
  AdsPerformanceChart,
  AnalyticsChart,
  CommentRow,
  DemoImage,
  LeadsSpreadsheet,
} from './FunnelDemoVisuals';

const USER_SCHEDULE = 'Post this at 9:30 on all platforms';
const USER_REPLY = 'Reply to all comments on my last post';
const USER_ANALYTICS = 'Show my analytics for the week';
const USER_LEADS = 'Send me leads from comments';
const USER_BRAINSTORM = 'Brainstorm ideas like my best post';
const USER_ADS = 'Compare ad campaign performance';

const PLATFORM_ICONS = [
  InstagramIcon,
  TikTokIcon,
  YoutubeIcon,
  FacebookIcon,
  XTwitterIcon,
  LinkedinIcon,
  ThreadsIcon,
  PinterestIcon,
];

function TypeCursor({ active }: { active: boolean }) {
  if (!active) return null;
  return <span className="inline-block w-px h-3 ml-0.5 bg-white/70 animate-pulse align-middle" />;
}

export function FunnelDemoSceneSchedule({ progress }: { progress: number }) {
  const showImage = progress > 0.06;
  const userText = typewriterSlice(USER_SCHEDULE, progress, 0.2, 0.52);
  const showUser = progress > 0.1;
  const showAssistant = progress > 0.58;

  return (
    <>
      <FunnelDemoUserBubble show={showUser} visual>
        {showImage ? (
          <div className="mb-1 overflow-hidden rounded-lg border border-white/20">
            <DemoImage src={FUNNEL_DEMO_POST_VIDEO_SRC} alt="Post video preview" className="aspect-[4/3] max-h-[120px]" />
          </div>
        ) : null}
        {userText}
        <TypeCursor active={progress > 0.2 && progress < 0.52} />
      </FunnelDemoUserBubble>
      <FunnelDemoAssistantBubble show={showAssistant} visual>
        <div className="grid grid-cols-4 gap-1">
          {PLATFORM_ICONS.map((Icon, i) => (
            <span
              key={i}
              className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700"
            >
              <Icon size={13} />
            </span>
          ))}
        </div>
        <p className="mt-1.5 inline-flex items-center gap-1 text-[9px] font-semibold text-emerald-600 dark:text-emerald-400">
          <CheckCircle2 size={10} /> Scheduled · 9:30 AM
        </p>
      </FunnelDemoAssistantBubble>
    </>
  );
}

export function FunnelDemoSceneComments({ progress }: { progress: number }) {
  const userText = typewriterSlice(USER_REPLY, progress, 0.1, 0.4);
  const showAssistant = progress > 0.46;

  return (
    <>
      <FunnelDemoUserBubble show={progress > 0.08}>
        {userText}
        <TypeCursor active={progress > 0.1 && progress < 0.4} />
      </FunnelDemoUserBubble>
      <FunnelDemoAssistantBubble show={showAssistant} visual>
        <ul className="space-y-1">
          <CommentRow
            show={progress > 0.5 || progress >= 1}
            name="Maya R."
            avatar="MR"
            colorClass="bg-violet-500"
            text="Love this!"
            replied={progress > 0.68 || progress >= 1}
          />
          <CommentRow
            show={progress > 0.58 || progress >= 1}
            name="Alex K."
            avatar="AK"
            colorClass="bg-sky-500"
            text="Where can I buy?"
            highlight
            replied={progress > 0.78 || progress >= 1}
          />
        </ul>
      </FunnelDemoAssistantBubble>
    </>
  );
}

export function FunnelDemoSceneAnalytics({ progress }: { progress: number }) {
  const userText = typewriterSlice(USER_ANALYTICS, progress, 0.1, 0.38);
  const showAssistant = progress > 0.44;

  return (
    <>
      <FunnelDemoUserBubble show={progress > 0.08}>
        {userText}
        <TypeCursor active={progress > 0.1 && progress < 0.38} />
      </FunnelDemoUserBubble>
      <FunnelDemoAssistantBubble show={showAssistant} visual>
        <AnalyticsChart show={showAssistant} />
      </FunnelDemoAssistantBubble>
    </>
  );
}

export function FunnelDemoSceneLeads({ progress }: { progress: number }) {
  const userText = typewriterSlice(USER_LEADS, progress, 0.1, 0.36);
  const showAssistant = progress > 0.42;

  return (
    <>
      <FunnelDemoUserBubble show={progress > 0.08}>
        {userText}
        <TypeCursor active={progress > 0.1 && progress < 0.36} />
      </FunnelDemoUserBubble>
      <FunnelDemoAssistantBubble show={showAssistant} visual>
        <LeadsSpreadsheet show={showAssistant} />
      </FunnelDemoAssistantBubble>
    </>
  );
}

export function FunnelDemoSceneTikTokIdeas({ progress }: { progress: number }) {
  const userText = typewriterSlice(USER_BRAINSTORM, progress, 0.08, 0.34);
  const showAssistant = progress > 0.4;

  return (
    <>
      <FunnelDemoUserBubble show={progress > 0.06}>
        {userText}
        <TypeCursor active={progress > 0.08 && progress < 0.34} />
      </FunnelDemoUserBubble>
      <FunnelDemoAssistantBubble show={showAssistant} visual>
        <div className="overflow-hidden rounded-lg border border-neutral-200 dark:border-neutral-700">
          <DemoImage
            src={FUNNEL_DEMO_BRAINSTORM_WINNER_SRC}
            alt="Top performing post"
            className="aspect-[4/3] max-h-[130px]"
          />
          <div className="flex items-center justify-between gap-2 bg-neutral-50 dark:bg-neutral-950 px-1.5 py-1">
            <span className="text-[8px] font-semibold text-emerald-600 dark:text-emerald-400">Top performer</span>
            <span className="text-[7px] text-neutral-500">2.1M views · 184K likes</span>
          </div>
        </div>
      </FunnelDemoAssistantBubble>
    </>
  );
}

export function FunnelDemoSceneAdsRoas({ progress }: { progress: number }) {
  const showAssistant = progress > 0.2;

  return (
    <>
      <FunnelDemoUserBubble show={progress > 0.06}>
        {typewriterSlice(USER_ADS, progress, 0.06, 0.3)}
        <TypeCursor active={progress > 0.06 && progress < 0.3} />
      </FunnelDemoUserBubble>
      <FunnelDemoAssistantBubble show={showAssistant} visual>
        <div className="relative">
          <div className="absolute top-0 right-0 rounded-full bg-neutral-900/90 px-1.5 py-0.5 text-[6px] font-semibold uppercase tracking-wide text-white z-10">
            Coming soon
          </div>
          <AdsPerformanceChart show={showAssistant} />
          <table className="w-full text-[7px]">
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
                  className={`border-b border-neutral-100 dark:border-neutral-800 last:border-0 ${
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
