'use client';

import React from 'react';
import {
  FunnelDemoAssistantBubble,
  FunnelDemoUserBubble,
} from './FunnelDemoFrame';
import { PlatformPostPreviewGrid } from '@/components/shared/PlatformPostPreviewSquare';
import { FunnelDemoAllowBar, FunnelDemoScheduledChip } from './FunnelDemoShared';
import {
  FUNNEL_DEMO_PEOPLE_AVATARS,
  FUNNEL_DEMO_POST_VIDEO_SRC,
  FUNNEL_DEMO_PROFILE_AVATAR_SRC,
} from './funnel-demo-assets';
import {
  AdsPerformanceChart,
  AdsTopCreativesCandleChart,
  AnalyticsReportPreview,
  BrainstormIdeasPanel,
  ChatAttachmentReel,
  CommentRow,
  InstagramWeeklyAnalyticsPanel,
  LeadsSpreadsheet,
  TeamMembersPanel,
} from './FunnelDemoVisuals';

const USER_SCHEDULE = 'Upload this to Instagram, TikTok, and YouTube Shorts at 9:30.';
const USER_REPLY = 'Reply to all of the comments from Instagram and YouTube.';
const USER_ANALYTICS = 'Show me weekly analytics for Instagram.';
const USER_LEADS =
  'Send me a list of new potential leads from the last 24 hours from the comments and DMs.';
const USER_BRAINSTORM = 'Brainstorm new ideas based on my best YouTube video.';
const USER_ADS = 'Compare Google, Meta, and TikTok ad ROAS side by side.';
const USER_TEAM = 'Invite my editor and show who has been active on the account this week.';
const USER_REPORTS = 'Export an analytic report for all platforms as a PDF.';

const SCHEDULE_PROFILE = {
  profileAvatarSrc: FUNNEL_DEMO_PROFILE_AVATAR_SRC,
  profileName: 'Levitate Crew',
} as const;

const SCHEDULE_PREVIEWS = [
  {
    platformLabel: 'Instagram',
    accentClass: 'bg-gradient-to-r from-[#E1306C] to-[#FCAF45]',
    ...SCHEDULE_PROFILE,
    profileHandle: 'levitate.crew',
    mediaFormat: 'shorts' as const,
    caption:
      'City flow at dawn. Precision jumps, core control, zero fear. Train parkour the smart way. #Parkour #Reels',
    imageSrc: FUNNEL_DEMO_POST_VIDEO_SRC,
    imageAlt: 'Parkour reel preview for Instagram',
  },
  {
    platformLabel: 'TikTok',
    accentClass: 'bg-neutral-950',
    ...SCHEDULE_PROFILE,
    profileHandle: 'levitate',
    mediaFormat: 'shorts' as const,
    caption:
      'New line. Same discipline. Parkour is calculated movement, not reckless. Watch the full sequence.',
    imageSrc: FUNNEL_DEMO_POST_VIDEO_SRC,
    imageAlt: 'Parkour reel preview for TikTok',
  },
  {
    platformLabel: 'YouTube Shorts',
    accentClass: 'bg-[#FF0000]',
    ...SCHEDULE_PROFILE,
    profileHandle: 'levitatecrew',
    mediaFormat: 'shorts' as const,
    caption:
      'From ledge to launch: explosive control without a gym. Full breakdown in the comments.',
    imageSrc: FUNNEL_DEMO_POST_VIDEO_SRC,
    imageAlt: 'Parkour reel preview for YouTube Shorts',
  },
];

const COMMENT_DRAFTS = [
  { name: 'Maya Rodriguez', avatar: 'MR', avatarSrc: FUNNEL_DEMO_PEOPLE_AVATARS.maya, colorClass: 'bg-violet-500', text: 'Love this Reel! Exactly what I needed.', replyText: 'Thank you, Maya! So glad it helped. Let me know if you want the full checklist.', replyPlatform: 'instagram' as const },
  { name: 'James Okonkwo', avatar: 'JO', avatarSrc: FUNNEL_DEMO_PEOPLE_AVATARS.james, colorClass: 'bg-emerald-500', text: 'Does this work for small teams too?', replyText: 'Yes, James. Most teams start with one hook and scale from there.', replyPlatform: 'youtube' as const },
  { name: 'Alex Kim', avatar: 'AK', avatarSrc: FUNNEL_DEMO_PEOPLE_AVATARS.alex, colorClass: 'bg-sky-500', text: 'Where can I buy this? Ship to Canada?', replyText: 'Yes! Link in bio ships worldwide, including Canada.', replyPlatform: 'instagram' as const },
  { name: 'Priya Sharma', avatar: 'PS', avatarSrc: FUNNEL_DEMO_PEOPLE_AVATARS.priya, colorClass: 'bg-amber-500', text: 'Can you share the template from the video?', replyText: 'Absolutely. I will DM you the template right after this goes live.', replyPlatform: 'youtube' as const },
  { name: 'Daniel Frost', avatar: 'DF', avatarSrc: FUNNEL_DEMO_PEOPLE_AVATARS.daniel, colorClass: 'bg-amber-500', text: 'This hook is fire. Saving for later.', replyText: 'Appreciate you, Daniel! Full breakdown is in the pinned comment.', replyPlatform: 'instagram' as const },
  { name: 'Lina Park', avatar: 'LP', avatarSrc: FUNNEL_DEMO_PEOPLE_AVATARS.lina, colorClass: 'bg-rose-500', text: 'Subbed after this Short. More like this?', replyText: 'Yes! Part 2 drops tomorrow on the same topic.', replyPlatform: 'youtube' as const },
  { name: 'Zoe Martin', avatar: 'ZM', avatarSrc: FUNNEL_DEMO_PEOPLE_AVATARS.zoe, colorClass: 'bg-indigo-500', text: 'How long did this take to edit?', replyText: 'About 20 minutes in Composer with AI captions.', replyPlatform: 'instagram' as const },
  { name: 'Emma Walsh', avatar: 'EW', avatarSrc: FUNNEL_DEMO_PEOPLE_AVATARS.emma, colorClass: 'bg-cyan-500', text: 'Pinned! Need the full workflow.', replyText: 'Workflow breakdown is in your YouTube reply draft.', replyPlatform: 'youtube' as const },
];

function DemoSceneScroll({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`funnel-demo-scene-scroll flex min-h-0 flex-col gap-2 overflow-y-auto overscroll-contain pr-0.5 ${className ?? ''}`}>
      {children}
    </div>
  );
}

export function FunnelDemoSceneSchedule({ progress }: { progress: number }) {
  if (progress < 1) return null;

  return (
    <>
      <div className="flex w-full flex-col items-end gap-1.5">
        <ChatAttachmentReel src={FUNNEL_DEMO_POST_VIDEO_SRC} alt="Parkour reel vertical video" />
        <FunnelDemoUserBubble show visual={false}>
          {USER_SCHEDULE}
        </FunnelDemoUserBubble>
      </div>
      <FunnelDemoAssistantBubble show visual wide>
        <p className="mb-1.5 text-[10px] font-semibold text-neutral-800 dark:text-neutral-200">
          I drafted Shorts previews for 9:30 AM:
        </p>
        <PlatformPostPreviewGrid previews={SCHEDULE_PREVIEWS} compact />
        <FunnelDemoScheduledChip
          timeLabel="9:30 AM"
          platforms="Instagram, TikTok, and YouTube Shorts"
          calendarHint=""
        />
      </FunnelDemoAssistantBubble>
      <FunnelDemoAllowBar
        compact
        message="Reel scheduled for 9:30 AM on all three platforms. Allow me to confirm?"
      />
    </>
  );
}

export function FunnelDemoSceneComments({ progress }: { progress: number }) {
  if (progress < 1) return null;

  return (
    <DemoSceneScroll>
      <FunnelDemoUserBubble show>{USER_REPLY}</FunnelDemoUserBubble>
      <FunnelDemoAssistantBubble show visual wide contained>
        <p className="mb-1.5 text-[11px] font-semibold text-neutral-800 dark:text-neutral-200">
          16 comments on Instagram and YouTube. Here are draft replies:
        </p>
        <ul className="space-y-1">
          {COMMENT_DRAFTS.map((row) => (
            <CommentRow
              key={row.name}
              show
              name={row.name}
              avatar={row.avatar}
              avatarSrc={row.avatarSrc}
              colorClass={row.colorClass}
              text={row.text}
              replied
              replyText={row.replyText}
              replyPlatform={row.replyPlatform}
              draft
            />
          ))}
        </ul>
        <p className="mt-1.5 text-[10px] text-neutral-500 dark:text-neutral-400">
          + 8 more replies ready in the same voice.
        </p>
        <FunnelDemoAllowBar message="Would you like me to send these 16 replies?" />
      </FunnelDemoAssistantBubble>
    </DemoSceneScroll>
  );
}

export function FunnelDemoSceneAnalytics({ progress }: { progress: number }) {
  if (progress < 1) return null;

  return (
    <>
      <FunnelDemoUserBubble show>{USER_ANALYTICS}</FunnelDemoUserBubble>
      <FunnelDemoAssistantBubble show visual wide contained allowOverflow>
        <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-visible">
          <div className="funnel-demo-scene-scroll min-h-0 flex-1 overflow-y-auto overflow-x-visible overscroll-contain pr-0.5">
            <p className="mb-1.5 text-[10px] font-semibold text-neutral-800 dark:text-neutral-200">
              Instagram weekly snapshot:
            </p>
            <InstagramWeeklyAnalyticsPanel />
            <p className="mt-2 text-[10px] text-neutral-700 dark:text-neutral-300 leading-snug">
              Views up 18%, engagement up 12%, followers net +135. Reels drove most of the lift this week.
            </p>
          </div>
          <FunnelDemoAllowBar
            compact
            showRegenerate={false}
            message="Want me to pin this report to your Console and email a PDF every Monday?"
          />
        </div>
      </FunnelDemoAssistantBubble>
    </>
  );
}

export function FunnelDemoSceneLeads({ progress }: { progress: number }) {
  if (progress < 1) return null;

  return (
    <DemoSceneScroll>
      <FunnelDemoUserBubble show>{USER_LEADS}</FunnelDemoUserBubble>
      <FunnelDemoAssistantBubble show visual wide contained>
        <p className="mb-1.5 text-[11px] font-semibold text-neutral-800 dark:text-neutral-200">
          11 high-intent leads from the last 24 hours:
        </p>
        <LeadsSpreadsheet show progress={1} />
        <FunnelDemoAllowBar
          primaryLabel="Download"
          showRegenerate={false}
          compact
          message="Export this list as CSV and queue personalized DMs for each lead?"
        />
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
        <BrainstormIdeasPanel />
        <FunnelDemoAllowBar
          compact
          showRegenerate={false}
          message="Want me to open these as Composer drafts for TikTok and Instagram Reels?"
        />
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
          <AdsTopCreativesCandleChart />
          <p className="text-[10px] text-neutral-700 dark:text-neutral-300 leading-snug">
            TikTok leads on ROAS (4.17x) with the lowest CPA. Task Complete is your top creative at 4.82x.
          </p>
          <FunnelDemoAllowBar
            compact
            showRegenerate={false}
            message="Want a weekly ROAS snapshot emailed when cross-platform ads tracking launches?"
          />
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
