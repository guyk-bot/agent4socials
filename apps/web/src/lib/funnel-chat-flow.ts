import type { ChatHeroPlatformId } from '@/lib/chat-hero-script';
import type { BrandContextRecord } from '@/lib/brand-context-utils';

export type FunnelFlowStep =
  | 'pick_platform'
  | 'connected'
  | 'pick_action'
  | 'experience_choice'
  | 'brand_context'
  | 'free_chat'
  | 'signup_required';

export type FunnelActionId = 'publish' | 'brainstorm' | 'analytics' | 'inbox';

export const FUNNEL_OPENING_BODY =
  'Select the first platform you want to connect and I will show you everything I can do';

export const FUNNEL_OPENING_BODY_ARROW = '⬇️';

export const FUNNEL_ACTIONS: { id: FunnelActionId; label: string }[] = [
  { id: 'publish', label: 'Publish a post' },
  { id: 'brainstorm', label: 'Brainstorm ideas' },
  { id: 'analytics', label: 'See analytics' },
  { id: 'inbox', label: 'Manage inbox' },
];

export function funnelConnectedMessage(
  platformLabel: string,
  username: string,
  summary?: string
): string {
  const extra = summary ? ` ${summary}` : '';
  return `Connected to ${platformLabel} as @${username}.${extra} What would you like to do first?`;
}

export function funnelExperienceChoiceMessage(): string {
  return 'For the best experience you can continue in the web app, or keep chatting here on the landing page.';
}

export function funnelBrandContextIntro(): string {
  return 'Before you publish, I recommend setting up your brand context so I get a full picture of your brand and can help you better. I drafted a starter profile below — edit anything, then tap Save.';
}

export function funnelMultiPlatformSignupMessage(): string {
  return 'Connecting more than one platform requires a free account. Sign in and we will bring everything from this chat into the app.';
}

export function funnelPublishReadyMessage(): string {
  return 'Tell me what you want to post and I will draft it in your brand voice. When you are happy with it, you can publish to your connected account from here.';
}

export function defaultBrandContextDraft(
  platformLabel: string,
  username: string
): BrandContextRecord {
  return {
    productDescription: `Content and offers from @${username} on ${platformLabel}.`,
    targetAudience: 'People who follow this account and engage with its content.',
    toneOfVoice: 'Clear, friendly, and on-brand.',
    toneExamples: 'Short hooks, direct CTAs, and authentic captions.',
    additionalContext: `Primary platform: ${platformLabel}.`,
  };
}

export function platformLabelFromId(id: ChatHeroPlatformId): string {
  const map: Record<ChatHeroPlatformId, string> = {
    instagram: 'Instagram',
    tiktok: 'TikTok',
    youtube: 'YouTube',
    facebook: 'Facebook',
    x: 'X (Twitter)',
    linkedin: 'LinkedIn',
    threads: 'Threads',
    pinterest: 'Pinterest',
  };
  return map[id] ?? id;
}
