/** Merge server post lists into the current History table without dropping rows the user already saw. */

export type PostHistoryRow = { id?: string; status?: string; targets?: unknown[]; [key: string]: unknown };

function postIdKey(post: PostHistoryRow): string | null {
  const id = post?.id;
  return typeof id === 'string' && id.length > 0 ? id : null;
}

/** Newest-first sort key (scheduled, posted, then created). */
export function postHistorySortTime(post: PostHistoryRow): number {
  const iso = (post.scheduledAt ?? post.postedAt ?? post.createdAt) as string | undefined;
  if (!iso) return 0;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? 0 : t;
}

export function sortPostsHistoryByNewest(list: PostHistoryRow[]): PostHistoryRow[] {
  return [...list].sort((a, b) => {
    const diff = postHistorySortTime(b) - postHistorySortTime(a);
    if (diff !== 0) return diff;
    const idA = postIdKey(a) ?? '';
    const idB = postIdKey(b) ?? '';
    return idB.localeCompare(idA);
  });
}

const STATUS_RANK: Record<string, number> = {
  DRAFT: 0,
  SCHEDULED: 0,
  POSTING: 2,
  POSTED: 3,
  FAILED: 3,
};

/** Same caption + platforms within this window are treated as one publish attempt (orphan pending/POSTING rows). */
const POST_HISTORY_DEDUPE_WINDOW_MS = 20 * 60 * 1000;

function postHistoryPlatformKey(post: PostHistoryRow): string {
  const targets = Array.isArray(post.targets) ? post.targets : [];
  const fromTargets = targets
    .map((t) => (t && typeof t === 'object' && 'platform' in t ? String((t as { platform: string }).platform) : ''))
    .filter(Boolean);
  const fromList = Array.isArray(post.targetPlatforms)
    ? (post.targetPlatforms as string[]).filter((p) => typeof p === 'string')
    : [];
  const platforms = [...new Set([...fromList, ...fromTargets])].map((p) => p.toUpperCase()).sort();
  return platforms.join(',');
}

function postHistoryContentKey(post: PostHistoryRow): string {
  return String(post.title ?? post.content ?? '')
    .trim()
    .toLowerCase()
    .slice(0, 200);
}

function postHistoryDedupeFingerprint(post: PostHistoryRow): string | null {
  const content = postHistoryContentKey(post);
  const platforms = postHistoryPlatformKey(post);
  if (!content || !platforms) return null;
  return `${platforms}|${content}`;
}

function canonicalPostHistoryRowScore(post: PostHistoryRow): number {
  let score = statusRank(post.status) * 100;
  const id = postIdKey(post);
  if (id && !id.startsWith('pending-')) score += 50;
  if (post._optimistic === true) score -= 40;
  if (id?.startsWith('pending-')) score -= 60;
  score += postHistorySortTime(post) / 1_000_000_000_000;
  return score;
}

/** Drop duplicate History rows (pending-* ghost + stale POSTING) for the same in-flight publish. */
export function pruneDuplicatePostHistoryRows(list: PostHistoryRow[]): PostHistoryRow[] {
  if (list.length < 2) return list;

  const groups = new Map<string, PostHistoryRow[]>();
  const ungrouped: PostHistoryRow[] = [];

  for (const post of list) {
    const fp = postHistoryDedupeFingerprint(post);
    if (!fp) {
      ungrouped.push(post);
      continue;
    }
    const g = groups.get(fp) ?? [];
    g.push(post);
    groups.set(fp, g);
  }

  const kept: PostHistoryRow[] = [...ungrouped];
  for (const group of groups.values()) {
    if (group.length === 1) {
      kept.push(group[0]);
      continue;
    }
    const times = group.map(postHistorySortTime).filter((t) => t > 0);
    const span = times.length >= 2 ? Math.max(...times) - Math.min(...times) : 0;
    if (span > POST_HISTORY_DEDUPE_WINDOW_MS) {
      kept.push(...group);
      continue;
    }
    const canonical = group.reduce((best, cur) =>
      canonicalPostHistoryRowScore(cur) > canonicalPostHistoryRowScore(best) ? cur : best
    );
    kept.push(canonical);
  }

  return sortPostsHistoryByNewest(kept);
}

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

  return pruneDuplicatePostHistoryRows(sortPostsHistoryByNewest(ordered));
}

/** Apply a single post update from GET /posts/:id without reshuffling the whole list. */
export function upsertPostInHistoryList(list: PostHistoryRow[], post: PostHistoryRow): PostHistoryRow[] {
  const id = postIdKey(post);
  if (!id) return list;
  const idx = list.findIndex((p) => postIdKey(p) === id);
  if (idx < 0) return mergePostsHistoryLists(list, [post]);
  const next = [...list];
  next[idx] = mergePostHistoryRecord(next[idx], post);
  return pruneDuplicatePostHistoryRows(sortPostsHistoryByNewest(next));
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
