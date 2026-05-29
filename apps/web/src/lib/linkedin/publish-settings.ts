/** Per-account LinkedIn publish options (stored on Post, like TikTok Direct Post). */

export type LinkedInPostVisibility = 'PUBLIC' | 'CONNECTIONS';

export type LinkedInPublishSettings = {
  visibility?: LinkedInPostVisibility;
};

export function normalizeLinkedInVisibility(value: unknown): LinkedInPostVisibility {
  return value === 'CONNECTIONS' ? 'CONNECTIONS' : 'PUBLIC';
}

export function isLinkedInPublishSettings(value: unknown): value is LinkedInPublishSettings {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const v = (value as LinkedInPublishSettings).visibility;
  return v === undefined || v === 'PUBLIC' || v === 'CONNECTIONS';
}

export function linkedInVisibilityForRestApi(visibility: LinkedInPostVisibility): string {
  return visibility;
}

export function linkedInVisibilityForUgcApi(visibility: LinkedInPostVisibility): string {
  return visibility;
}

export function mergeLinkedInPublishByAccountId(
  stored: Record<string, unknown> | null | undefined,
  body: Record<string, unknown> | null | undefined,
  allowedAccountIds: Set<string>
): Record<string, LinkedInPublishSettings> {
  const merged: Record<string, LinkedInPublishSettings> = {};
  const apply = (src: Record<string, unknown> | null | undefined) => {
    if (!src || typeof src !== 'object' || Array.isArray(src)) return;
    for (const [accountId, raw] of Object.entries(src)) {
      if (!allowedAccountIds.has(accountId) || !isLinkedInPublishSettings(raw)) continue;
      merged[accountId] = { visibility: normalizeLinkedInVisibility(raw.visibility) };
    }
  };
  apply(stored ?? undefined);
  apply(body ?? undefined);
  return merged;
}

export function linkedInVisibilityForAccount(
  merged: Record<string, LinkedInPublishSettings>,
  accountId: string
): LinkedInPostVisibility {
  return normalizeLinkedInVisibility(merged[accountId]?.visibility);
}
