const PREFIX = 'izop_draft_publish_';

export type ComposerDraftPublishPatch = {
  publishedAt?: string;
  publishedPostId?: string;
  scheduledAt?: string;
  publishStatusMessage?: string;
  publishError?: string;
};

function storageKey(userId: string, messageId: string, artifactIndex: number): string {
  return `${PREFIX}${userId}_${messageId}_${artifactIndex}`;
}

export function markComposerDraftPublishState(
  userId: string | undefined,
  messageId: string,
  artifactIndex: number,
  patch: ComposerDraftPublishPatch
): ComposerDraftPublishPatch {
  if (!userId || typeof window === 'undefined') return patch;
  try {
    localStorage.setItem(storageKey(userId, messageId, artifactIndex), JSON.stringify(patch));
  } catch {
    /* quota */
  }
  return patch;
}

export function readComposerDraftPublishState(
  userId: string | undefined,
  messageId: string,
  artifactIndex: number
): ComposerDraftPublishPatch | null {
  if (!userId || typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(storageKey(userId, messageId, artifactIndex));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ComposerDraftPublishPatch;
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

export function hasComposerDraftPublishState(patch: ComposerDraftPublishPatch | null | undefined): boolean {
  if (!patch) return false;
  return Boolean(patch.publishedAt || patch.scheduledAt || patch.publishError);
}
