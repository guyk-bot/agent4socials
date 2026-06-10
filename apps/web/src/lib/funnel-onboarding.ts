/** Post-sign-in redirect from landing funnel chat (sessionStorage). */

const POST_AUTH_KEY = 'izop_funnel_post_auth_redirect_v1';

export function setFunnelPostAuthRedirect(path: string): void {
  if (typeof window === 'undefined') return;
  const normalized = path.startsWith('/') ? path : `/${path}`;
  sessionStorage.setItem(POST_AUTH_KEY, normalized);
}

export function consumeFunnelPostAuthRedirect(): string | null {
  if (typeof window === 'undefined') return null;
  const raw = sessionStorage.getItem(POST_AUTH_KEY);
  if (!raw) return null;
  sessionStorage.removeItem(POST_AUTH_KEY);
  return raw.startsWith('/') ? raw : `/${raw}`;
}

export function dashboardPathAfterAuth(): string {
  return consumeFunnelPostAuthRedirect() ?? '/dashboard';
}

const FUNNEL_HANDOFF_KEY = 'izop_funnel_handoff_v1';

export type FunnelHandoffPayload = {
  token?: string | null;
  chat?: unknown;
  brand?: unknown;
  savedAt?: number;
};

export function readFunnelHandoff(): FunnelHandoffPayload | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(FUNNEL_HANDOFF_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as FunnelHandoffPayload;
  } catch {
    return null;
  }
}

export function clearFunnelHandoff(): void {
  if (typeof window === 'undefined') return;
  sessionStorage.removeItem(FUNNEL_HANDOFF_KEY);
}

export type FunnelOnboardingActionId =
  | 'connect'
  | 'brand'
  | 'schedule'
  | 'ai'
  | 'inbox'
  | 'analytics';

export type FunnelOnboardingAction = {
  id: FunnelOnboardingActionId;
  label: string;
  description: string;
  redirect: string;
  assistantReply: string;
};

export const FUNNEL_ONBOARDING_ACTIONS: FunnelOnboardingAction[] = [
  {
    id: 'connect',
    label: 'Connect my social accounts',
    description: 'Instagram, TikTok, YouTube, and more',
    redirect: '/dashboard?connect=instagram',
    assistantReply:
      'Great choice. After you sign in with Google we will open Connect so you can link your first account in under a minute.',
  },
  {
    id: 'brand',
    label: 'Set up my brand voice',
    description: 'Product, audience, and tone for AI',
    redirect: '/dashboard/brand',
    assistantReply:
      'Perfect. We will take you to Brand after sign-in so iZop AI and Composer match your voice.',
  },
  {
    id: 'schedule',
    label: 'Schedule my first post',
    description: 'Composer with multi-platform publish',
    redirect: '/composer',
    assistantReply:
      'Nice. Once you are signed in we will open Composer so you can draft and schedule your first post.',
  },
  {
    id: 'ai',
    label: 'Try iZop AI',
    description: 'Chat, leads, and content ideas',
    redirect: '/dashboard/aysop-ai',
    assistantReply:
      'Love it. After Google sign-in you will land in iZop AI to explore chat, leads, and ideas.',
  },
  {
    id: 'inbox',
    label: 'Set up my inbox',
    description: 'DMs and comments in one place',
    redirect: '/dashboard/inbox',
    assistantReply:
      'Smart move. Connect accounts first from the dashboard, then Inbox pulls comments and DMs together.',
  },
  {
    id: 'analytics',
    label: 'See my analytics',
    description: 'Followers, views, and engagement',
    redirect: '/dashboard',
    assistantReply:
      'You got it. Sign in and we will open your dashboard so you can connect accounts and see live metrics.',
  },
];
