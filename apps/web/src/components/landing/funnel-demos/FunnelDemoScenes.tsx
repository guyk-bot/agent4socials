'use client';

import React from 'react';
import {
  FunnelDemoAssistantBubble,
  FunnelDemoUserBubble,
} from './FunnelDemoFrame';
import { PlatformPostPreviewGrid } from '@/components/shared/PlatformPostPreviewSquare';
import { FunnelDemoAllowBar, FunnelDemoScheduledChip } from './FunnelDemoShared';
import {
  FUNNEL_DEMO_BRAINSTORM_WINNER_SRC,
  FUNNEL_DEMO_POST_VIDEO_SRC,
} from './funnel-demo-assets';
import {
  AdsPerformanceChart,
  AnalyticsReportPreview,
  ChatAttachmentImage,
  CommentRow,
  InstagramWeeklyAnalyticsPanel,
  LeadsSpreadsheet,
  TeamMembersPanel,
  YouTubeVideoPreview,
} from './FunnelDemoVisuals';

const USER_SCHEDULE = 'Post this on Instagram, X, Facebook at 9:30.';
const USER_REPLY = 'Reply to comments on my last post in my brand voice.';
const USER_ANALYTICS = 'Show me weekly analytics for Instagram.';
const USER_LEADS = 'Send me a spreadsheet of leads from comments with AI DM suggestions.';
const USER_BRAINSTORM = 'Brainstorm new ideas based on my best YouTube video.';
const USER_ADS = 'Compare Google, Meta, and TikTok ad ROAS side by side.';
const USER_TEAM = 'Invite my editor and show who has been active on the account this week.';
const USER_REPORTS = 'Export an analytic report for all platforms as a PDF.';

const SCHEDULE_PREVIEWS = [
  {
    platformLabel: 'Instagram',
    accentClass: 'bg-gradient-to-r from-[#E1306C] to-[#FCAF45]',
    caption:
      'City flow at dawn. Precision jumps, core control, zero fear. @levitate.crew trains parkour the smart way. Who is hitting a line this week? #Parkour #UrbanAthlete',
    imageSrc: FUNNEL_DEMO_POST_VIDEO_SRC,
    imageAlt: 'Parkour athlete training on a city ledge',
  },
  {
    platformLabel: 'X',
    accentClass: 'bg-neutral-900',
    caption:
      'New line. Same discipline. Parkour is not reckless, it is calculated movement. Watch the full sequence.',
    imageSrc: FUNNEL_DEMO_POST_VIDEO_SRC,
    imageAlt: 'Parkour athlete post preview for X',
  },
  {
    platformLabel: 'Facebook',
    accentClass: 'bg-[#1877F2]',
    caption:
      'From ledge to launch: how we train explosive control without a gym. Full breakdown in comments. Built for athletes who move differently.',
    imageSrc: FUNNEL_DEMO_POST_VIDEO_SRC,
    imageAlt: 'Parkour athlete post preview for Facebook',
  },
];

const COMMENT_DRAFTS = [
  {
    name: 'Maya Rodriguez',
    avatar: 'MR',
    colorClass: 'bg-violet-500',
    text: 'Love this! Exactly what I needed.',
    replyText: 'Thank you, Maya! So glad it helped. Let me know if you want the full checklist.',
  },
  {
    name: 'James Okonkwo',
    avatar: 'JO',
    colorClass: 'bg-emerald-500',
    text: 'Does this work for small teams too?',
    replyText: 'Yes, James. Most teams start with one hook and scale from there.',
  },
  {
    name: 'Alex Kim',
    avatar: 'AK',
    colorClass: 'bg-sky-500',
    text: 'Where can I buy this? Ship to Canada?',
    replyText: 'Yes! Link in bio ships worldwide, including Canada.',
  },
  {
    name: 'Priya Sharma',
    avatar: 'PS',
    colorClass: 'bg-amber-500',
    text: 'Can you share the template?',
    replyText: 'Absolutely. I will DM you the template right after this goes live.',
  },
];

function DemoSceneScroll({ children }: { children: React.ReactNode }) {
  return (
    <div className="funnel-demo-scene-scroll flex min-h-0 flex-col gap-2 overflow-y-auto overscroll-contain pr-0.5">
      {children}
    </div>
  );
}

export function FunnelDemoSceneSchedule({ progress }: { progress: number }) {
  if (progress < 1) return null;

  return (
    <DemoSceneScroll>
      <div className="flex w-full flex-col items-end gap-1.5">
        <ChatAttachmentImage src={FUNNEL_DEMO_POST_VIDEO_SRC} alt="Parkour athlete training on a city ledge" />
        <FunnelDemoUserBubble show visual={false}>
          {USER_SCHEDULE}
        </FunnelDemoUserBubble>
      </div>
      <FunnelDemoAssistantBubble show visual wide contained>
        <p className="mb-1.5 text-[10px] font-semibold text-neutral-800 dark:text-neutral-200">
          I drafted platform-specific previews for 9:30 AM:
        </p>
        <PlatformPostPreviewGrid previews={SCHEDULE_PREVIEWS} />
        <div className="mt-2 space-y-1">
          <p className="text-[10px] text-neutral-700 dark:text-neutral-300 leading-snug">
            Captions match your parkour influencer style: movement, discipline, and a clear CTA on each platform.
          </p>
          <FunnelDemoScheduledChip
            timeLabel="9:30 AM"
            platforms="Instagram, X, and Facebook"
          />
        </div>
        <FunnelDemoAllowBar message="Post scheduled to go live at 9:30 AM. Allow me to confirm?" />
      </FunnelDemoAssistantBubble>
    </DemoSceneScroll>
  );
}

export function FunnelDemoSceneComments({ progress }: { progress: number }) {
  if (progress < 1) return null;

  return (
    <DemoSceneScroll>
      <FunnelDemoUserBubble show>{USER_REPLY}</FunnelDemoUserBubble>
      <FunnelDemoAssistantBubble show visual wide contained>
        <p className="mb-1.5 text-[10px] font-semibold text-neutral-800 dark:text-neutral-200">
          You got 12 comments on your Summer launch Reel. Here are draft replies:
        </p>
        <ul className="space-y-1">
          {COMMENT_DRAFTS.map((row) => (
            <CommentRow
              key={row.name}
              show
              name={row.name}
              avatar={row.avatar}
              colorClass={row.colorClass}
              text={row.text}
              replied
              replyText={row.replyText}
              draft
            />
          ))}
        </ul>
        <p className="mt-1.5 text-[9px] text-neutral-500 dark:text-neutral-400">
          + 8 more replies ready in the same voice.
        </p>
        <FunnelDemoAllowBar message="Would you like me to send these 12 replies?" />
      </FunnelDemoAssistantBubble>
    </DemoSceneScroll>
  );
}

export function FunnelDemoSceneAnalytics({ progress }: { progress: number }) {
  if (progress < 1) return null;

  return (
    <DemoSceneScroll>
      <FunnelDemoUserBubble show>{USER_ANALYTICS}</FunnelDemoUserBubble>
      <FunnelDemoAssistantBubble show visual wide contained>
        <p className="mb-1.5 text-[10px] font-semibold text-neutral-800 dark:text-neutral-200">
          Instagram weekly snapshot:
        </p>
        <InstagramWeeklyAnalyticsPanel />
        <p className="mt-2 text-[10px] text-neutral-700 dark:text-neutral-300 leading-snug">
          Views up 18%, engagement up 12%, followers net +135. Reels drove most of the lift this week.
        </p>
        <FunnelDemoAllowBar
          message="Want me to pin this report to your Console and email a PDF every Monday?"
          approvedLabel="Weekly report enabled"
          showRegenerate={false}
        />
      </FunnelDemoAssistantBubble>
    </DemoSceneScroll>
  );
}

export function FunnelDemoSceneLeads({ progress }: { progress: number }) {
  if (progress < 1) return null;

  return (
    <DemoSceneScroll>
      <FunnelDemoUserBubble show>{USER_LEADS}</FunnelDemoUserBubble>
      <FunnelDemoAssistantBubble show visual wide contained>
        <p className="mb-1.5 text-[10px] font-semibold text-neutral-800 dark:text-neutral-200">
          I found 9 high-intent leads from recent comments:
        </p>
        <LeadsSpreadsheet show progress={1} />
        <FunnelDemoAllowBar message="Should I export this spreadsheet and queue personalized DMs for each lead?" />
      </FunnelDemoAssistantBubble>
    </DemoSceneScroll>
  );
}

export function FunnelDemoSceneTikTokIdeas({ progress }: { progress: number }) {
  if (progress < 1) return null;

  return (
    <DemoSceneScroll>
      <FunnelDemoUserBubble show>{USER_BRAINSTORM}</FunnelDemoUserBubble>
      <FunnelDemoAssistantBubble show visual wide contained>
        <YouTubeVideoPreview
          src={FUNNEL_DEMO_BRAINSTORM_WINNER_SRC}
          alt="Top performing YouTube video"
          title="3 Hooks that 10X my savings"
        />
        <p className="mt-2 text-[11px] text-neutral-700 dark:text-neutral-300 leading-snug">
          Your best format: bold hook on screen + quick tip in the first 3 seconds. I drafted 3 TikTok scripts in your voice.
        </p>
        <ol className="mt-1.5 space-y-1 text-[10px] text-neutral-700 dark:text-neutral-300">
          <li>1. POV: You find $200/month without cutting coffee.</li>
          <li>2. Stop doing this with your savings account.</li>
          <li>3. The 30-second rule that fixed my budget.</li>
        </ol>
        <FunnelDemoAllowBar message="Want me to open these as Composer drafts for TikTok and Instagram Reels?" />
      </FunnelDemoAssistantBubble>
    </DemoSceneScroll>
  );
}

export function FunnelDemoSceneAdsRoas({ progress }: { progress: number }) {
  if (progress < 1) return null;

  return (
    <DemoSceneScroll>
      <FunnelDemoUserBubble show>{USER_ADS}</FunnelDemoUserBubble>
      <FunnelDemoAssistantBubble show visual wide contained>
        <div className="flex flex-col gap-2 min-h-0">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[12px] font-bold text-neutral-900 dark:text-neutral-100">Paid ads ROAS</p>
            <span className="shrink-0 rounded-full bg-orange-500 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white">
              Coming soon
            </span>
          </div>
          <AdsPerformanceChart show />
          <p className="text-[10px] text-neutral-700 dark:text-neutral-300 leading-snug">
            TikTok leads on ROAS (4.17x) with the lowest CPA. Meta spend is highest but still profitable at 2.91x.
          </p>
          <FunnelDemoAllowBar message="Want a weekly ROAS snapshot emailed when cross-platform ads tracking launches?" />
        </div>
      </FunnelDemoAssistantBubble>
    </DemoSceneScroll>
  );
}

export function FunnelDemoSceneTeamMembers({ progress }: { progress: number }) {
  if (progress < 1) return null;

  return (
    <DemoSceneScroll>
      <FunnelDemoUserBubble show>{USER_TEAM}</FunnelDemoUserBubble>
      <FunnelDemoAssistantBubble show visual wide contained>
        <TeamMembersPanel show progress={1} />
        <FunnelDemoAllowBar message="Should I send an invite to your editor and share this activity summary?" />
      </FunnelDemoAssistantBubble>
    </DemoSceneScroll>
  );
}

export function FunnelDemoSceneReports({ progress }: { progress: number }) {
  if (progress < 1) return null;

  return (
    <DemoSceneScroll>
      <FunnelDemoUserBubble show>{USER_REPORTS}</FunnelDemoUserBubble>
      <FunnelDemoAssistantBubble show visual wide contained>
        <AnalyticsReportPreview show progress={1} />
        <FunnelDemoAllowBar message="Allow me to generate and download the full PDF report now?" />
      </FunnelDemoAssistantBubble>
    </DemoSceneScroll>
  );
}

export const FUNNEL_DEMO_SCENE_COMPONENTS = [
  FunnelDemoSceneSchedule,
  FunnelDemoSceneComments,
  FunnelDemoSceneAnalytics,
  FunnelDemoSceneLeads,
  FunnelDemoSceneTikTokIdeas,
  FunnelDemoSceneAdsRoas,
  FunnelDemoSceneTeamMembers,
  FunnelDemoSceneReports,
] as const;
