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
  if (!res.ok) throw new Error('Could not start funnel session');
  const data = (await res.json()) as { token?: string };
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
