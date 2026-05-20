/** Merge server post lists into the current History table without dropping rows the user already saw. */

export type PostHistoryRow = { id?: string; [key: string]: unknown };

function postIdKey(post: PostHistoryRow): string | null {
  const id = post?.id;
  return typeof id === 'string' && id.length > 0 ? id : null;
}

/**
 * Merge `incoming` into `previous` by id. Keeps prior rows not in incoming.
 * Preserves stable row order: existing rows stay in place; new ids append at the end.
 */
export function mergePostsHistoryLists(previous: PostHistoryRow[], incoming: PostHistoryRow[]): PostHistoryRow[] {
  if (!incoming.length) return previous.length ? [...previous] : [];

  const byId = new Map<string, PostHistoryRow>();
  for (const p of previous) {
    const id = postIdKey(p);
    if (id) byId.set(id, p);
  }
  for (const p of incoming) {
    const id = postIdKey(p);
    if (id) {
      byId.set(id, { ...(byId.get(id) ?? {}), ...p });
    }
  }

  const ordered: PostHistoryRow[] = [];
  const seen = new Set<string>();

  for (const p of previous) {
    const id = postIdKey(p);
    if (id) {
      seen.add(id);
      ordered.push(byId.get(id) ?? p);
    } else {
      ordered.push(p);
    }
  }

  for (const p of incoming) {
    const id = postIdKey(p);
    if (id && !seen.has(id)) {
      seen.add(id);
      ordered.push(byId.get(id)!);
    } else if (!id) {
      ordered.push(p);
    }
  }

  return ordered;
}

/** Apply a single post update from GET /posts/:id without reshuffling the whole list. */
export function upsertPostInHistoryList(list: PostHistoryRow[], post: PostHistoryRow): PostHistoryRow[] {
  const id = postIdKey(post);
  if (!id) return list;
  const idx = list.findIndex((p) => postIdKey(p) === id);
  if (idx < 0) return mergePostsHistoryLists(list, [post]);
  const next = [...list];
  next[idx] = { ...next[idx], ...post };
  return next;
}
