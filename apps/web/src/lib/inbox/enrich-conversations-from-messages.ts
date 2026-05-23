import { getInboxMessagesFromDb, type InboxConversationListItem } from '@/lib/inbox/inbox-db-cache';
import { writeInboxProfileCache } from '@/lib/inbox/inbox-profile-cache';

/** Fill missing DM sender names/avatars from cached thread messages (no Meta API). */
export async function enrichConversationListFromMessageCache(
  socialAccountId: string,
  platform: 'instagram' | 'facebook',
  list: InboxConversationListItem[]
): Promise<InboxConversationListItem[]> {
  const out: InboxConversationListItem[] = [];

  for (const conv of list) {
    const senders = conv.senders ?? [];
    const first = senders[0];
    const hasName = !!(first?.name?.trim() || first?.username?.trim());
    const hasPicture = !!first?.pictureUrl;
    if (hasName && hasPicture) {
      out.push(conv);
      continue;
    }

    const msgs = await getInboxMessagesFromDb(socialAccountId, conv.id, conv.updatedTime, true);
    const inbound = msgs?.find((m) => !m.isFromPage && (m.fromName?.trim() || m.fromId));
    if (!inbound?.fromName?.trim() && !inbound?.fromId) {
      out.push(conv);
      continue;
    }

    const rawName = inbound.fromName?.trim() ?? '';
    const username = rawName.startsWith('@') ? rawName.slice(1) : rawName.includes('_') ? rawName : undefined;
    const name = username ? undefined : rawName || undefined;
    const senderId = first?.id ?? inbound.fromId ?? undefined;
    const updatedSenders = [
      {
        id: senderId,
        name: name ?? first?.name,
        username: username ?? first?.username ?? (name ? undefined : rawName),
        pictureUrl: first?.pictureUrl ?? null,
      },
    ];

    if (senderId && (name || username || updatedSenders[0]?.pictureUrl)) {
      void writeInboxProfileCache(platform, senderId, {
        name,
        username: username ?? first?.username,
        pictureUrl: updatedSenders[0]?.pictureUrl ?? null,
      });
    }

    out.push({ ...conv, senders: updatedSenders });
  }

  return out;
}
