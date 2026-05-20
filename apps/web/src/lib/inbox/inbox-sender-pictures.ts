/**
 * Persist DM sender profile photos in localStorage so the conversation list keeps
 * avatars after opening a thread (Meta often only returns profile_pic on message load).
 */

const KEY_BASE = 'agent4socials_inbox_sender_pictures';

type PictureStore = Record<string, { pictureUrl: string; name?: string; username?: string }>;

function storeKey(userId: string): string {
  return `${KEY_BASE}_${userId}`;
}

function loadStore(userId: string): PictureStore {
  if (typeof window === 'undefined' || !userId) return {};
  try {
    const raw = localStorage.getItem(storeKey(userId));
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
      ? (parsed as PictureStore)
      : {};
  } catch {
    return {};
  }
}

function saveStore(userId: string, store: PictureStore): void {
  if (typeof window === 'undefined' || !userId) return;
  try {
    const keys = Object.keys(store);
    const trimmed =
      keys.length > 500
        ? Object.fromEntries(keys.slice(-500).map((k) => [k, store[k]]))
        : store;
    localStorage.setItem(storeKey(userId), JSON.stringify(trimmed));
  } catch {
    /* quota */
  }
}

export function getInboxSenderPicture(
  userId: string | null | undefined,
  convId: string,
  username?: string | null
): string | null {
  if (!userId || !convId) return null;
  const store = loadStore(userId);
  if (store[convId]?.pictureUrl) return store[convId].pictureUrl;
  if (username) {
    const u = username.replace(/^@/, '').toLowerCase();
    const byUser = store[`u:${u}`];
    if (byUser?.pictureUrl) return byUser.pictureUrl;
  }
  return null;
}

export function setInboxSenderPicture(
  userId: string | null | undefined,
  convId: string,
  pictureUrl: string | null | undefined,
  meta?: { name?: string | null; username?: string | null }
): void {
  if (!userId || !convId || !pictureUrl?.trim()) return;
  const store = loadStore(userId);
  const entry = {
    pictureUrl: pictureUrl.trim(),
    ...(meta?.name ? { name: meta.name } : {}),
    ...(meta?.username ? { username: meta.username } : {}),
  };
  store[convId] = entry;
  if (meta?.username) {
    const u = meta.username.replace(/^@/, '').toLowerCase();
    store[`u:${u}`] = entry;
  }
  saveStore(userId, store);
}

export function mergeSenderPicturesIntoConversations<
  T extends {
    id: string;
    senders?: Array<{ id?: string; name?: string; username?: string; pictureUrl?: string | null }>;
  },
>(conversations: T[], userId: string | null | undefined): T[] {
  if (!userId) return conversations;
  const store = loadStore(userId);
  if (Object.keys(store).length === 0) return conversations;

  return conversations.map((c) => {
    const senders = c.senders ?? [];
    if (senders.length === 0) return c;
    const first = senders[0];
    const stored =
      store[c.id] ??
      (first.username ? store[`u:${first.username.replace(/^@/, '').toLowerCase()}`] : undefined);
    if (!stored?.pictureUrl && !first.pictureUrl) return c;
    return {
      ...c,
      senders: [
        {
          ...first,
          pictureUrl: first.pictureUrl ?? stored?.pictureUrl ?? null,
          name: first.name || stored?.name,
          username: first.username || stored?.username,
        },
        ...senders.slice(1),
      ],
    };
  });
}
