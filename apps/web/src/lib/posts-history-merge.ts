/** Merge server post lists into the current History table without dropping rows the user already saw. */

export type PostHistoryRow = { id?: string; status?: string; targets?: unknown[]; [key: string]: unknown };

function postIdKey(post: PostHistoryRow): string | null {
  const id = post?.id;
  return typeof id === 'string' && id.length > 0 ? id : null;
}

const STATUS_RANK: Record<string, number> = {
  DRAFT: 0,
  SCHEDULED: 0,
  POSTING: 2,
  POSTED: 3,
  FAILED: 3,
};

function statusRank(status: unknown): number {
  if (typeof status !== 'string') return 0;
  return STATUS_RANK[status] ?? 1;
}

/** Never let a stale API row downgrade POSTING to DRAFT (common during background publish). */
export function mergePostHistoryRecord(previous: PostHistoryRow, incoming: PostHistoryRow): PostHistoryRow {
  const prevStatus = previous.status;
  const incStatus = incoming.status;
  let status = incStatus;
  if (statusRank(prevStatus) > statusRank(incStatus)) {
    status = prevStatus;
  }
  if (prevStatus === 'POSTING' && incStatus === 'DRAFT') {
    status = 'POSTING';
  }

  const prevTargets = Array.isArray(previous.targets) ? previous.targets : [];
  const incTargets = Array.isArray(incoming.targets) ? incoming.targets : [];
  let targets = incTargets.length > 0 ? incTargets : prevTargets;
  if (prevTargets.length > 0 && incTargets.length > 0) {
    const byPlatform = new Map<string, Record<string, unknown>>();
    for (const t of prevTargets) {
      if (t && typeof t === 'object' && 'platform' in t) {
        byPlatform.set(String((t as { platform: string }).platform), t as Record<string, unknown>);
      }
    }
    for (const t of incTargets) {
      if (!t || typeof t !== 'object' || !('platform' in t)) continue;
      const platform = String((t as { platform: string }).platform);
      const prevT = byPlatform.get(platform);
      const incT = t as Record<string, unknown>;
      if (!prevT) {
        byPlatform.set(platform, incT);
        continue;
      }
      const prevTs = prevT.status;
      const incTs = incT.status;
      let ts = incTs;
      if (statusRank(prevTs) > statusRank(incTs)) ts = prevTs;
      if (prevTs === 'POSTING' && incTs === 'DRAFT') ts = 'POSTING';
      byPlatform.set(platform, { ...prevT, ...incT, status: ts });
    }
    targets = [...byPlatform.values()];
  }

  return {
    ...previous,
    ...incoming,
    status,
    targets,
    media: Array.isArray(incoming.media) && incoming.media.length > 0 ? incoming.media : previous.media,
  };
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
      const prev = byId.get(id);
      byId.set(id, prev ? mergePostHistoryRecord(prev, p) : p);
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
  next[idx] = mergePostHistoryRecord(next[idx], post);
  return next;
}

/** Skip React re-render when visible id/status/errors are unchanged. */
export function postsHistoryListsVisuallyEqual(a: PostHistoryRow[], b: PostHistoryRow[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const pa = a[i];
    const pb = b[i];
    if (postIdKey(pa) !== postIdKey(pb)) return false;
    if (pa?.status !== pb?.status) return false;
    const ta = Array.isArray(pa?.targets) ? pa.targets : [];
    const tb = Array.isArray(pb?.targets) ? pb.targets : [];
    if (ta.length !== tb.length) return false;
    for (let j = 0; j < ta.length; j++) {
      const aT = ta[j] as { platform?: string; status?: string; error?: string };
      const bT = tb[j] as { platform?: string; status?: string; error?: string };
      if (aT?.platform !== bT?.platform || aT?.status !== bT?.status || aT?.error !== bT?.error) return false;
    }
  }
  return true;
}
