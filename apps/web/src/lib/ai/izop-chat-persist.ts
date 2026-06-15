import type { StoredIzopMessage } from '@/lib/ai/izop-chat-sessions';
import { normalizeChatAttachments } from '@/lib/ai/izop-attachments';

/** Normalize messages from API or client before DB write. Keeps id, content, role, artifacts, attachments. */
export function normalizeStoredMessages(raw: unknown): StoredIzopMessage[] {
  if (!Array.isArray(raw)) return [];
  const out: StoredIzopMessage[] = [];
  for (const row of raw) {
    if (!row || typeof row !== 'object') continue;
    const m = row as Record<string, unknown>;
    const role = m.role;
    const content = m.content;
    if (role !== 'user' && role !== 'assistant') continue;
    if (typeof content !== 'string') continue;
    const id = typeof m.id === 'string' && m.id.trim() ? m.id : `msg-${out.length}`;
    const attachments = normalizeChatAttachments(m.attachments);
    const item: StoredIzopMessage = { id, role, content };
    if (Array.isArray(m.artifacts)) item.artifacts = m.artifacts;
    if (attachments.length) item.attachments = attachments;
    out.push(item);
  }
  return out;
}

export function hasConversation(messages: StoredIzopMessage[]): boolean {
  return messages.some(
    (m) => m.content.trim().length > 0 || (m.attachments?.length ?? 0) > 0
  );
}

type ArtifactRow = Record<string, unknown>;

function composerDraftPublishWeight(artifacts: unknown[] | undefined): number {
  if (!Array.isArray(artifacts)) return 0;
  return artifacts.reduce<number>((sum, raw) => {
    const art = raw as ArtifactRow;
    if (art?.type !== 'composer_post_draft') return sum;
    let w = 0;
    if (typeof art.publishedAt === 'string') w += 500;
    if (typeof art.scheduledAt === 'string') w += 500;
    if (typeof art.publishedPostId === 'string') w += 200;
    if (typeof art.publishStatusMessage === 'string') w += 100;
    if (typeof art.publishError === 'string') w += 100;
    return sum + w;
  }, 0);
}

function mergeComposerDraftPublishFields(
  serverArt: ArtifactRow,
  localArt: ArtifactRow | undefined
): ArtifactRow {
  if (serverArt.type !== 'composer_post_draft' || localArt?.type !== 'composer_post_draft') {
    return serverArt;
  }
  const merged = { ...serverArt };
  if (!merged.publishedAt && localArt.publishedAt) merged.publishedAt = localArt.publishedAt;
  if (!merged.publishedPostId && localArt.publishedPostId) merged.publishedPostId = localArt.publishedPostId;
  if (!merged.scheduledAt && localArt.scheduledAt) merged.scheduledAt = localArt.scheduledAt;
  if (!merged.publishStatusMessage && localArt.publishStatusMessage) {
    merged.publishStatusMessage = localArt.publishStatusMessage;
  }
  if (!merged.publishError && localArt.publishError) merged.publishError = localArt.publishError;
  return merged;
}

function mergeResolvedArtifactPublishState<T extends { artifacts?: unknown[] }>(
  picked: T[],
  local: T[],
  server: T[]
): T[] {
  if (picked.length === 0 || local.length !== picked.length) return picked;
  return picked.map((row, index) => {
    const localRow = local[index];
    const serverRow = server[index];
    if (!Array.isArray(row.artifacts)) return row;
    const mergedArtifacts = row.artifacts.map((art, artifactIndex) => {
      const localArt = Array.isArray(localRow?.artifacts)
        ? (localRow.artifacts[artifactIndex] as ArtifactRow | undefined)
        : undefined;
      const serverArt = Array.isArray(serverRow?.artifacts)
        ? (serverRow.artifacts[artifactIndex] as ArtifactRow | undefined)
        : undefined;
      const base = (art as ArtifactRow) ?? {};
      return mergeComposerDraftPublishFields(base, localArt ?? serverArt);
    });
    return { ...row, artifacts: mergedArtifacts };
  });
}

/** Prefer the richer copy when local cache and server history disagree. */
export function pickBestStoredMessages<
  T extends { content?: string; attachments?: unknown[]; artifacts?: unknown[] },
>(local: T[], server: T[]): T[] {
  if (server.length > local.length) {
    return mergeResolvedArtifactPublishState(server, local, server);
  }
  if (local.length > server.length) return local;
  if (local.length === 0) return server;

  const weight = (rows: T[]) =>
    rows.reduce(
      (sum, row) =>
        sum +
        String(row.content ?? '').length +
        (Array.isArray(row.attachments) ? row.attachments.length * 200 : 0) +
        composerDraftPublishWeight(row.artifacts),
      0
    );

  const picked = weight(server) >= weight(local) ? server : local;
  return mergeResolvedArtifactPublishState(picked, local, server);
}
