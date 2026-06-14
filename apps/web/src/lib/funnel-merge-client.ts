'use client';

import {
  clearFunnelHandoff,
  readFunnelHandoff,
  setFunnelOpenIzopChatId,
} from '@/lib/funnel-onboarding';
import { readFunnelSessionToken } from '@/lib/funnel-session-client';

export const FUNNEL_MERGED_EVENT = 'izop-funnel-merged';

export type FunnelMergedAccount = {
  id: string;
  platform: string;
  username?: string;
  profilePicture?: string | null;
};

export type FunnelMergeClientResult = {
  ok?: boolean;
  mergedAccounts?: number;
  accounts?: FunnelMergedAccount[];
  brandContextMerged?: boolean;
  izopChatSessionId?: string;
  importedPostId?: string;
};

let mergeInFlight: Promise<FunnelMergeClientResult | null> | null = null;

export function resolveFunnelTokenForMerge(): string | null {
  const handoff = readFunnelHandoff();
  if (handoff?.token?.trim()) return handoff.token.trim();
  return readFunnelSessionToken();
}

export function getFunnelMergePromise(): Promise<FunnelMergeClientResult | null> {
  return mergeInFlight ?? Promise.resolve(null);
}

export function resetFunnelMergeState(): void {
  mergeInFlight = null;
}

export async function runFunnelMergeIfNeeded(
  accessToken: string
): Promise<FunnelMergeClientResult | null> {
  if (typeof window === 'undefined') return null;
  const token = resolveFunnelTokenForMerge();
  if (!token) return null;
  if (!mergeInFlight) {
    mergeInFlight = performFunnelMerge(accessToken, token);
  }
  return mergeInFlight;
}

async function performFunnelMerge(
  accessToken: string,
  token: string
): Promise<FunnelMergeClientResult | null> {
  try {
    const res = await fetch('/api/funnel/merge', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'X-Funnel-Session': token,
      },
      body: JSON.stringify({ funnelToken: token }),
    });
    const data = (await res.json().catch(() => ({}))) as FunnelMergeClientResult & {
      error?: string;
    };
    if (!res.ok) {
      console.warn('[funnel-merge]', data.error ?? res.status);
      return null;
    }
    clearFunnelHandoff();
    if (data.izopChatSessionId) {
      setFunnelOpenIzopChatId(data.izopChatSessionId);
    }
    window.dispatchEvent(new CustomEvent(FUNNEL_MERGED_EVENT, { detail: data }));
    return data;
  } catch (e) {
    console.warn('[funnel-merge]', e instanceof Error ? e.message : e);
    return null;
  }
}
