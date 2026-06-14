const PREFIX = 'izop_bc_artifact_';

function storageKey(userId: string, messageId: string, artifactIndex: number): string {
  return `${PREFIX}${userId}_${messageId}_${artifactIndex}`;
}

export function markBrandContextArtifactApproved(
  userId: string | undefined,
  messageId: string,
  artifactIndex: number
): string {
  const approvedAt = new Date().toISOString();
  if (!userId || typeof window === 'undefined') return approvedAt;
  try {
    localStorage.setItem(storageKey(userId, messageId, artifactIndex), approvedAt);
  } catch {
    /* quota */
  }
  return approvedAt;
}

export function readBrandContextArtifactApproved(
  userId: string | undefined,
  messageId: string,
  artifactIndex: number
): string | null {
  if (!userId || typeof window === 'undefined') return null;
  try {
    return localStorage.getItem(storageKey(userId, messageId, artifactIndex));
  } catch {
    return null;
  }
}

export function markBrandContextArtifactDismissed(
  userId: string | undefined,
  messageId: string,
  artifactIndex: number
): void {
  if (!userId || typeof window === 'undefined') return;
  try {
    localStorage.removeItem(storageKey(userId, messageId, artifactIndex));
  } catch {
    /* quota */
  }
}
