import type { ChatHeroPlatformId } from '@/lib/chat-hero-script';
import { readFunnelChatState } from '@/lib/funnel-session-client';

/** Platform order matches sidebar; uniform cards in a 4×2 grid. */
export const CONNECT_PLATFORM_CARDS = [
  { id: 'FACEBOOK', name: 'Facebook', slug: 'facebook' },
  { id: 'INSTAGRAM', name: 'Instagram', slug: 'instagram' },
  { id: 'TIKTOK', name: 'TikTok', slug: 'tiktok' },
  { id: 'YOUTUBE', name: 'YouTube', slug: 'youtube' },
  { id: 'TWITTER', name: 'Twitter/X', slug: 'twitter' },
  { id: 'THREADS', name: 'Threads', slug: 'threads' },
  { id: 'PINTEREST', name: 'Pinterest', slug: 'pinterest' },
  { id: 'LINKEDIN', name: 'LinkedIn', slug: 'linkedin' },
] as const;

export type ConnectPlatformCardId = (typeof CONNECT_PLATFORM_CARDS)[number]['id'];

const FUNNEL_PLATFORM_TO_CARD_ID: Record<ChatHeroPlatformId, ConnectPlatformCardId> = {
  facebook: 'FACEBOOK',
  instagram: 'INSTAGRAM',
  tiktok: 'TIKTOK',
  youtube: 'YOUTUBE',
  x: 'TWITTER',
  threads: 'THREADS',
  pinterest: 'PINTEREST',
  linkedin: 'LINKEDIN',
};

/** Funnel chat platforms to show first on the connect grid (e.g. after homepage sign-in). */
export function readFunnelPreferredPlatformIds(): ConnectPlatformCardId[] {
  if (typeof window === 'undefined') return [];
  const chat = readFunnelChatState();
  const ids = new Set<ConnectPlatformCardId>();
  if (chat?.connectedPlatform) {
    const mapped = FUNNEL_PLATFORM_TO_CARD_ID[chat.connectedPlatform];
    if (mapped) ids.add(mapped);
  }
  return [...ids];
}

export function sortConnectPlatformCards<T extends { id: string }>(
  cards: T[],
  preferredIds: string[]
): T[] {
  if (preferredIds.length === 0) return cards;
  const rank = new Map(preferredIds.map((id, i) => [id, i]));
  return [...cards].sort((a, b) => {
    const ar = rank.get(a.id) ?? 999;
    const br = rank.get(b.id) ?? 999;
    if (ar !== br) return ar - br;
    return cards.findIndex((c) => c.id === a.id) - cards.findIndex((c) => c.id === b.id);
  });
}

export const CONNECT_CARD_CLASS =
  'account-connect-card flex flex-col items-center justify-center gap-2 p-3 sm:p-4 rounded-xl border border-neutral-200 bg-white hover:shadow-md hover:scale-[1.02] active:scale-[0.98] transition-all duration-200 group text-center';
