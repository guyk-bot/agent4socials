const PLATFORM_LABELS: Record<string, string> = {
  INSTAGRAM: 'Instagram',
  FACEBOOK: 'Facebook',
  TIKTOK: 'TikTok',
  YOUTUBE: 'YouTube',
  TWITTER: 'X',
  LINKEDIN: 'LinkedIn',
  PINTEREST: 'Pinterest',
  THREADS: 'Threads',
};

function normalizeHandle(value: string): string {
  return value.trim().replace(/^@+/, '');
}

/** Username stored as the platform name when OAuth/profile fetch failed. */
export function isGenericAccountUsername(
  username: string | null | undefined,
  platform: string
): boolean {
  if (!username?.trim()) return true;
  const u = normalizeHandle(username).toLowerCase();
  const p = platform.toUpperCase();
  const label = (PLATFORM_LABELS[p] ?? p).toLowerCase();
  if (u === p.toLowerCase()) return true;
  if (u === label) return true;
  if (u === 'x user' && p === 'TWITTER') return true;
  if (u === 'instagram' && p === 'INSTAGRAM') return true;
  if (u === 'tiktok user' && p === 'TIKTOK') return true;
  if (u === 'youtube channel' && p === 'YOUTUBE') return true;
  if (u === 'facebook page' && p === 'FACEBOOK') return true;
  return false;
}

export type DraftAccountDisplay = {
  profileName: string;
  handle: string;
  username: string;
  profilePicture: string | null;
};

export function resolveDraftAccountDisplay(
  draft: {
    platform: string;
    username: string | null;
    profilePicture?: string | null;
    accountId: string;
    displayName?: string | null;
  },
  cachedAccount?: { username?: string; profilePicture?: string | null } | null
): DraftAccountDisplay {
  const platformUpper = draft.platform.toUpperCase();

  let username = draft.username;
  let profilePicture = draft.profilePicture ?? null;
  const displayName = draft.displayName?.trim() || null;

  if (cachedAccount) {
    if (isGenericAccountUsername(username, platformUpper) && cachedAccount.username?.trim()) {
      username = cachedAccount.username;
    }
    if (!profilePicture && cachedAccount.profilePicture) {
      profilePicture = cachedAccount.profilePicture;
    }
  }

  const cleanUsername = normalizeHandle(username ?? '');
  const resolvedUsername =
    cleanUsername ||
    (cachedAccount?.username ? normalizeHandle(cachedAccount.username) : '') ||
    'account';

  const profileName =
    (displayName && !isGenericAccountUsername(displayName, platformUpper)
      ? displayName
      : null) ??
    (isGenericAccountUsername(resolvedUsername, platformUpper)
      ? PLATFORM_LABELS[platformUpper] ?? draft.platform
      : resolvedUsername);

  const handle = `@${resolvedUsername}`;

  return {
    profileName,
    handle,
    username: resolvedUsername,
    profilePicture,
  };
}
