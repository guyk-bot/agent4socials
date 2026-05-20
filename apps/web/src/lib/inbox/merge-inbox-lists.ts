/** Merge inbox list rows without dropping items when a sync returns an empty or partial payload. */

export type InboxSenderRow = {
  id?: string;
  name?: string;
  username?: string;
  pictureUrl?: string | null;
};

/** Merge participant senders by id so badge polls cannot wipe names/avatars by array index. */
export function mergeInboxSenderRows(
  prevSenders: InboxSenderRow[] | undefined,
  incomingSenders: InboxSenderRow[] | undefined
): InboxSenderRow[] {
  const prev = prevSenders ?? [];
  const incoming = incomingSenders ?? [];
  if (incoming.length === 0) return prev.length > 0 ? prev : incoming;
  if (prev.length === 0) return incoming;

  const hasIds = incoming.some((s) => s.id) || prev.some((s) => s.id);
  if (!hasIds) {
    return incoming.map((s, i) => ({
      ...s,
      pictureUrl: s.pictureUrl ?? prev[i]?.pictureUrl ?? null,
      name: s.name?.trim() ? s.name : prev[i]?.name,
      username: s.username?.trim() ? s.username : prev[i]?.username,
    }));
  }

  const byId = new Map<string, InboxSenderRow>();
  for (const s of prev) {
    if (s.id) byId.set(s.id, s);
  }
  for (const s of incoming) {
    if (!s.id) continue;
    const old = byId.get(s.id);
    byId.set(s.id, {
      ...old,
      ...s,
      pictureUrl: s.pictureUrl ?? old?.pictureUrl ?? null,
      name: s.name?.trim() ? s.name : old?.name,
      username: s.username?.trim() ? s.username : old?.username,
    });
  }
  const merged = [...byId.values()];
  return merged.length > 0 ? merged : incoming;
}

/** Union merge keyed rows; keep previous list when incoming is empty. */
export function mergeStableKeyedList<T>(
  previous: T[],
  incoming: T[],
  keyOf: (row: T) => string,
  mergeRow: (prev: T | undefined, next: T) => T
): T[] {
  if (incoming.length === 0 && previous.length > 0) return previous;

  const byId = new Map<string, T>();
  for (const row of previous) byId.set(keyOf(row), row);
  for (const row of incoming) {
    const id = keyOf(row);
    byId.set(id, mergeRow(byId.get(id), row));
  }
  return [...byId.values()];
}
