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
  ChatDragDropImage,
  CommentRow,
  LeadsSpreadsheet,
  YouTubeVideoPreview,
} from './FunnelDemoVisuals';

const USER_SCHEDULE = 'Post this post at 9:30 on all platforms';
const USER_REPLY =
  'Reply to every comment on my last post. Use my brand voice and answer product questions.';
const USER_ANALYTICS = 'Show my weekly analytics: views, engagement, and followers';
const USER_LEADS = 'Send me a spreadsheet of leads from comments with AI DM suggestions';
const USER_BRAINSTORM = 'Brainstorm new ideas based on my best YouTube video';
const USER_ADS = 'Compare Google, Meta, and TikTok ad ROAS side by side';

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
  return <span className="inline-block w-px h-3.5 ml-0.5 bg-white/70 animate-pulse align-middle" />;
}

export function FunnelDemoSceneSchedule({ progress }: { progress: number }) {
  const userText = typewriterSlice(USER_SCHEDULE, progress, 0.48, 0.82);
  const showUser = progress > 0.06;
  const showAssistant = progress > 0.88;

  return (
    <>
      <FunnelDemoUserBubble show={showUser} visual>
        <ChatDragDropImage progress={progress} src={FUNNEL_DEMO_POST_VIDEO_SRC} alt="Post media" />
        {(progress >= 0.48 || userText.length > 0) && (
          <p className="mt-2">
            {userText}
            <TypeCursor active={progress > 0.48 && progress < 0.82} />
          </p>
        )}
      </FunnelDemoUserBubble>
      <FunnelDemoAssistantBubble show={showAssistant} visual>
        <div className="grid grid-cols-4 gap-1.5">
          {PLATFORM_ICONS.map((Icon, i) => (
            <span
              key={i}
              className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700"
            >
              <Icon size={15} />
            </span>
          ))}
        </div>
        <p className="mt-2 inline-flex items-center gap-1.5 text-[12px] font-semibold text-emerald-600 dark:text-emerald-400">
          <CheckCircle2 size={13} /> Scheduled for 9:30 AM across 8 platforms
        </p>
      </FunnelDemoAssistantBubble>
    </>
  );
}

export function FunnelDemoSceneComments({ progress }: { progress: number }) {
  const userText = typewriterSlice(USER_REPLY, progress, 0.08, 0.38);
  const showAssistant = progress > 0.44;

  return (
    <>
      <FunnelDemoUserBubble show={progress > 0.06}>
        {userText}
        <TypeCursor active={progress > 0.08 && progress < 0.38} />
      </FunnelDemoUserBubble>
      <FunnelDemoAssistantBubble show={showAssistant} visual contained>
        <p className="mb-1.5 text-[10px] font-semibold text-neutral-800 dark:text-neutral-200">
          Summer launch Reel · 847 comments
        </p>
        <ul className="space-y-1">
          <CommentRow
            show={progress > 0.2 || progress >= 1}
            name="Maya Rodriguez"
            avatar="MR"
            colorClass="bg-violet-500"
            text="Love this! Exactly what I needed."
            replied={progress > 0.34 || progress >= 1}
            replyText="Thank you, Maya! So glad it helped."
          />
          <CommentRow
            show={progress > 0.38 || progress >= 1}
            name="James Okonkwo"
            avatar="JO"
            colorClass="bg-emerald-500"
            text="We crushed it, huge win for the team!"
            highlight
            replied={progress > 0.52 || progress >= 1}
            replyText="Love that energy, James! Check your DMs."
          />
          <CommentRow
            show={progress > 0.56 || progress >= 1}
            name="Alex Kim"
            avatar="AK"
            colorClass="bg-sky-500"
            text="Where can I buy this? Ship to Canada?"
            replied={progress > 0.7 || progress >= 1}
            replyText="Yes! Link in bio ships worldwide."
          />
        </ul>
        {(progress > 0.82 || progress >= 1) && (
          <p className="mt-1.5 text-[10px] font-semibold text-[var(--primary)]">
            847 personalized replies sent in 4 min
          </p>
        )}
      </FunnelDemoAssistantBubble>
    </>
  );
}

export function FunnelDemoSceneAnalytics({ progress }: { progress: number }) {
  const userText = typewriterSlice(USER_ANALYTICS, progress, 0.1, 0.36);
  const showAssistant = progress > 0.42;

  return (
    <>
      <FunnelDemoUserBubble show={progress > 0.08}>
        {userText}
        <TypeCursor active={progress > 0.1 && progress < 0.36} />
      </FunnelDemoUserBubble>
      <FunnelDemoAssistantBubble show={showAssistant} visual wide>
        <AnalyticsChart show={showAssistant} />
      </FunnelDemoAssistantBubble>
    </>
  );
}

export function FunnelDemoSceneLeads({ progress }: { progress: number }) {
  const userText = typewriterSlice(USER_LEADS, progress, 0.1, 0.34);
  const showAssistant = progress > 0.4;

  return (
    <>
      <FunnelDemoUserBubble show={progress > 0.08}>
        {userText}
        <TypeCursor active={progress > 0.1 && progress < 0.34} />
      </FunnelDemoUserBubble>
      <FunnelDemoAssistantBubble show={showAssistant} visual wide>
        <LeadsSpreadsheet show={showAssistant} progress={progress} />
      </FunnelDemoAssistantBubble>
    </>
  );
}

export function FunnelDemoSceneTikTokIdeas({ progress }: { progress: number }) {
  const userText = typewriterSlice(USER_BRAINSTORM, progress, 0.08, 0.32);
  const showAssistant = progress > 0.38;

  return (
    <>
      <FunnelDemoUserBubble show={progress > 0.06}>
        {userText}
        <TypeCursor active={progress > 0.08 && progress < 0.32} />
      </FunnelDemoUserBubble>
      <FunnelDemoAssistantBubble show={showAssistant} visual wide>
        <YouTubeVideoPreview
          src={FUNNEL_DEMO_BRAINSTORM_WINNER_SRC}
          alt="Top performing YouTube video"
          title="3 Hooks that 10X my savings"
        />
        {(progress > 0.7 || progress >= 1) && (
          <p className="mt-2 text-[11px] text-neutral-700 dark:text-neutral-300 leading-snug">
            Your best format: bold hook on screen + quick tip in the first 3 seconds. I can draft 3 scripts in your voice.
          </p>
        )}
      </FunnelDemoAssistantBubble>
    </>
  );
}

export function FunnelDemoSceneAdsRoas({ progress }: { progress: number }) {
  const showAssistant = progress > 0.2;

  return (
    <>
      <FunnelDemoUserBubble show={progress > 0.06}>
        {typewriterSlice(USER_ADS, progress, 0.06, 0.28)}
        <TypeCursor active={progress > 0.06 && progress < 0.28} />
      </FunnelDemoUserBubble>
      <FunnelDemoAssistantBubble show={showAssistant} visual wide>
        <div className="flex flex-col gap-2 min-h-0">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[12px] font-bold text-neutral-900 dark:text-neutral-100">Paid ads ROAS</p>
            <span className="shrink-0 rounded-full bg-orange-500 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white">
              Coming soon
            </span>
          </div>
          <AdsPerformanceChart show={showAssistant} />
          <table className="w-full text-[10px]">
            <thead>
              <tr className="text-neutral-500 border-b border-neutral-200 dark:border-neutral-700">
                <th className="text-left py-1 font-semibold">Platform</th>
                <th className="text-right py-1 font-semibold">Spend</th>
                <th className="text-right py-1 font-semibold">ROAS</th>
                <th className="text-right py-1 font-semibold">CPA</th>
              </tr>
            </thead>
            <tbody className="text-neutral-800 dark:text-neutral-200">
              {[
                { name: 'Google', spend: '$2,437', roas: '3.84×', cpa: '$12.40', hot: true },
                { name: 'Meta', spend: '$5,084', roas: '2.91×', cpa: '$18.20', hot: false },
                { name: 'TikTok', spend: '$1,792', roas: '4.17×', cpa: '$9.85', hot: true },
              ].map((row, i) => (
                <tr
                  key={row.name}
                  className={`border-b border-neutral-100 dark:border-neutral-800 last:border-0 ${
                    progress > 0.35 + i * 0.12 || progress >= 1 ? 'opacity-100' : 'opacity-30'
                  }`}
                >
                  <td className="py-1 font-medium">{row.name}</td>
                  <td className="text-right py-1 tabular-nums">{row.spend}</td>
                  <td
                    className={`text-right py-1 font-bold tabular-nums ${
                      row.hot ? 'text-emerald-600 dark:text-emerald-400' : ''
                    }`}
                  >
                    {row.roas}
                  </td>
                  <td className="text-right py-1 tabular-nums text-neutral-600 dark:text-neutral-400">{row.cpa}</td>
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
