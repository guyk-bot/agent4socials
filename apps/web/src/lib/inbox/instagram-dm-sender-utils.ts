import type { InboxConversationListItem } from '@/lib/inbox/inbox-db-cache';

/** Placeholder from an older inbox build; treat as missing identity. */
export function isBogusInstagramInboxSenderName(name?: string | null): boolean {
  const t = name?.trim().toLowerCase();
  return t === 'instagram conversation' || t === 'instagram conversati...';
}

export function sanitizeInstagramInboxSenders(
  list: InboxConversationListItem[]
): InboxConversationListItem[] {
  return list.map((c) => {
    const senders = c.senders ?? [];
    if (senders.length === 0) return c;
    const cleaned = senders.map((s) => {
      if (!isBogusInstagramInboxSenderName(s.name)) return s;
      return { ...s, name: undefined };
    });
    return { ...c, senders: cleaned };
  });
}
