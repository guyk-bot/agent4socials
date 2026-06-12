import {
  FREE_PLAN_HIGHLIGHTS,
  PRO_PLAN_HIGHLIGHTS,
  STANDARD_PLAN_HIGHLIGHTS,
} from '@/lib/pricing/plan-marketing';
import { PRO_PLAN_PRICING, STANDARD_PLAN_PRICING } from '@/lib/pricing/constants';
import { landingChatLinksKnowledgeBlock } from '@/lib/landing-chat-links';

/** Where users open a support ticket (same as Help → Support). */
export const LANDING_CHAT_SUPPORT_URL = 'https://www.izop.ai/help#support-ticket';

export const LANDING_CHAT_SUPPORT_FALLBACK =
  `I do not have a specific answer for that. Open a support ticket at ${LANDING_CHAT_SUPPORT_URL} — our team typically replies within 24 hours.`;

export const LANDING_CHAT_ADS_REPLY =
  'We are currently developing ads inside iZop. When it is ready, we will email our users with everything you need to get started. Sign up free so you are on that list.';

/** Facts the funnel chat may use (scripted + LLM system prompt). */
export function landingChatKnowledgeBlock(): string {
  const platforms =
    'Instagram, TikTok, YouTube, Facebook, X (Twitter), LinkedIn, Threads, and Pinterest';

  return [
    'Product: iZop is an AI social media manager. One dashboard to schedule posts, manage inbox (comments and DMs), run analytics, brainstorm content, scan comments for leads, and chat with iZop AI in your brand voice.',
    `Platforms supported: ${platforms}. Connect with official OAuth after signup.`,
    'Composer: write once, pick platforms and times, publish or schedule. Supports Reels, Shorts, carousels, and Stories where each platform allows.',
    'Inbox: Instagram, Facebook, and X comments and DMs in one place. iZop AI drafts replies; Standard+ can send replies. Pro adds bulk comment replies.',
    'Analytics: follower, view, and engagement metrics per platform. Ask iZop AI in plain English (e.g. best post this week). Export PDF reports on Standard and Pro.',
    'Brainstorm: AI ideas from your top-performing content, saved as hooks, ideas, and content pillars.',
    'Leads: scan comments and DMs for buyer intent, classify leads, export CSV.',
    'Team (Pro): invite editors and viewers, activity summary per member.',
    'White label (Pro): custom branding for client-facing views.',
    'Smart link pages: on the roadmap (coming soon).',
    'Ads: in active development. When ads launch, iZop will email registered users with full setup details. The marketing funnel chat cannot run ads or campaigns.',
    'Funnel connect flow: users can connect ONE platform from the landing chat without signing in (OAuth). After connect they can brainstorm in chat, set brand context inline, and draft posts. Publishing uses the connected account OAuth scopes. A second platform requires sign-in. Message limit: 100 user messages per funnel session, then sign in to continue in the app.',
    `Free plan: ${FREE_PLAN_HIGHLIGHTS.join('; ')}.`,
    `Standard ($${STANDARD_PLAN_PRICING.monthly}/mo or $${STANDARD_PLAN_PRICING.yearly}/yr, 20% off yearly): ${STANDARD_PLAN_HIGHLIGHTS.join('; ')}.`,
    `Pro ($${PRO_PLAN_PRICING.monthly}/mo or $${PRO_PLAN_PRICING.yearly}/yr, 20% off yearly): ${PRO_PLAN_HIGHLIGHTS.join('; ')}.`,
    'Billing: no credit card for Free. Upgrade or cancel anytime from dashboard settings.',
    'Signup: Google or email. After signup, Connect links each social account securely.',
    `Support: ${LANDING_CHAT_SUPPORT_URL} — typical response within 24 hours.`,
    landingChatLinksKnowledgeBlock(),
  ].join('\n');
}
