'use client';

import type { ChatHeroPlatformId } from '@/lib/chat-hero-script';
import type { BrandContextRecord } from '@/lib/brand-context-utils';
import type { FunnelChatPayload } from '@/lib/funnel-guest';

const STORAGE_KEY = 'izop_funnel_session_token_v1';
const CHAT_STORAGE_KEY = 'izop_funnel_chat_state_v1';
const BRAND_STORAGE_KEY = 'izop_funnel_brand_draft_v1';

export type FunnelPersistedChatState = {
  blocks: unknown[];
  step: string;
  connectedAccountId?: string | null;
  connectedPlatform?: ChatHeroPlatformId | null;
  connectedUsername?: string | null;
};

export function readFunnelSessionToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(STORAGE_KEY);
}

export function writeFunnelSessionToken(token: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, token);
}

export async function ensureFunnelSession(): Promise<string> {
  const existing = readFunnelSessionToken();
  if (existing) return existing;

  const res = await fetch('/api/funnel/session', { method: 'POST' });
  const data = (await res.json()) as { token?: string; error?: string };
  if (!res.ok) {
    throw new Error(data.error || 'Could not start funnel session. Please refresh and try again.');
  }
  if (!data.token) throw new Error('Invalid funnel session response');
  writeFunnelSessionToken(data.token);
  return data.token;
}

export function funnelAuthHeaders(): Record<string, string> {
  const token = readFunnelSessionToken();
  return token ? { 'X-Funnel-Session': token } : {};
}

export function persistFunnelChatState(state: FunnelPersistedChatState): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(state));
  const token = readFunnelSessionToken();
  if (!token) return;
  const payload: FunnelChatPayload = {
    blocks: state.blocks,
    step: state.step,
    connectedAccountId: state.connectedAccountId,
    connectedPlatform: state.connectedPlatform,
  };
  void fetch('/api/funnel/session', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...funnelAuthHeaders() },
    body: JSON.stringify({ chatPayload: payload }),
  }).catch(() => {});
}

export function readFunnelChatState(): FunnelPersistedChatState | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(CHAT_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as FunnelPersistedChatState;
  } catch {
    return null;
  }
}

export function persistFunnelBrandDraft(draft: BrandContextRecord): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(BRAND_STORAGE_KEY, JSON.stringify(draft));
  void fetch('/api/funnel/session', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...funnelAuthHeaders() },
    body: JSON.stringify({ brandContextDraft: draft }),
  }).catch(() => {});
}

export function readFunnelBrandDraft(): BrandContextRecord | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(BRAND_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as BrandContextRecord;
  } catch {
    return null;
  }
}

export function saveFunnelForAppHandoff(): void {
  if (typeof window === 'undefined') return;
  const token = readFunnelSessionToken();
  const chat = readFunnelChatState();
  const brand = readFunnelBrandDraft();
  sessionStorage.setItem(
    'izop_funnel_handoff_v1',
    JSON.stringify({ token, chat, brand, savedAt: Date.now() })
  );
}

export const FUNNEL_PLATFORM_TO_API: Record<ChatHeroPlatformId, string> = {
  instagram: 'instagram',
  tiktok: 'tiktok',
  youtube: 'youtube',
  facebook: 'facebook',
  x: 'twitter',
  linkedin: 'linkedin',
  threads: 'threads',
  pinterest: 'pinterest',
};

/** Map Prisma Platform enum or OAuth slug to funnel platform id. */
export function funnelPlatformFromOAuthSlug(slug: string | null | undefined): ChatHeroPlatformId | null {
  if (!slug) return null;
  const key = slug.trim().toLowerCase();
  const map: Record<string, ChatHeroPlatformId> = {
    instagram: 'instagram',
    tiktok: 'tiktok',
    youtube: 'youtube',
    facebook: 'facebook',
    twitter: 'x',
    x: 'x',
    linkedin: 'linkedin',
    threads: 'threads',
    pinterest: 'pinterest',
  };
  return map[key] ?? null;
}

export type FunnelConnectionStatus = {
  connectedAccountId: string;
  connectedPlatform: ChatHeroPlatformId;
  connectedUsername: string | null;
  connectedProfilePicture?: string | null;
};

export type FunnelBrandDraftResponse = {
  accountId: string;
  platform: ChatHeroPlatformId;
  platformLabel: string;
  username: string;
  profilePicture: string | null;
  draft: BrandContextRecord;
  brandContextSource?: 'profile' | 'manual';
  hashtagPool?: string[];
};

/** Read server-side funnel connect state (survives OAuth popup / cross-origin postMessage gaps). */
export async function fetchFunnelConnectionStatus(): Promise<FunnelConnectionStatus | null> {
  const token = readFunnelSessionToken();
  if (!token) return null;
  try {
    const res = await fetch('/api/funnel/session', { headers: funnelAuthHeaders() });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      connectedAccountId?: string | null;
      connectedPlatform?: string | null;
      connectedUsername?: string | null;
      connectedProfilePicture?: string | null;
    };
    const platform = funnelPlatformFromOAuthSlug(data.connectedPlatform);
    if (!data.connectedAccountId || !platform) return null;
    return {
      connectedAccountId: data.connectedAccountId,
      connectedPlatform: platform,
      connectedUsername: data.connectedUsername ?? null,
      connectedProfilePicture: data.connectedProfilePicture ?? null,
    };
  } catch {
    return null;
  }
}

export async function fetchFunnelBrandDraft(accountId: string): Promise<FunnelBrandDraftResponse | null> {
  try {
    const res = await fetch(
      `/api/funnel/brand-draft?accountId=${encodeURIComponent(accountId)}`,
      { headers: funnelAuthHeaders() }
    );
    if (!res.ok) return null;
    return (await res.json()) as FunnelBrandDraftResponse;
  } catch {
    return null;
  }
}

export async function retryFunnelOAuthResolve(
  tryFn: () => Promise<boolean>,
  attempts = 15,
  intervalMs = 2000
): Promise<boolean> {
  for (let i = 0; i < attempts; i += 1) {
    if (await tryFn()) return true;
    if (i < attempts - 1) {
      await new Promise((resolve) => window.setTimeout(resolve, intervalMs));
    }
  }
  return false;
}

export const FUNNEL_OAUTH_PENDING_KEY = 'izop_funnel_oauth_pending_v1';

export type FunnelOAuthPending = {
  platform: ChatHeroPlatformId;
  token: string;
  startedAt: number;
};

export function writeFunnelOAuthPending(platform: ChatHeroPlatformId, token: string): void {
  if (typeof window === 'undefined') return;
  const payload: FunnelOAuthPending = { platform, token, startedAt: Date.now() };
  sessionStorage.setItem(FUNNEL_OAUTH_PENDING_KEY, JSON.stringify(payload));
}

export function readFunnelOAuthPending(): FunnelOAuthPending | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(FUNNEL_OAUTH_PENDING_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as FunnelOAuthPending;
  } catch {
    return null;
  }
}

export function clearFunnelOAuthPending(): void {
  if (typeof window === 'undefined') return;
  sessionStorage.removeItem(FUNNEL_OAUTH_PENDING_KEY);
}
