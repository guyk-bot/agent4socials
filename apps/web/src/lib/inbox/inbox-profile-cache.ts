const PROFILE_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type InboxProfileCacheEntry = {
  name?: string;
  username?: string;
  pictureUrl?: string | null;
};

function cacheKey(platform: 'instagram' | 'facebook', userId: string): string {
  return `inbox-profile:${platform}:${userId}`;
}

function usernameCacheKey(platform: 'instagram' | 'facebook', username: string): string {
  return `inbox-profile:${platform}:u:${username.replace(/^@/, '').toLowerCase()}`;
}

export async function readInboxProfileCacheByUsername(
  platform: 'instagram' | 'facebook',
  username: string
): Promise<InboxProfileCacheEntry | null> {
  return readInboxProfileCacheByKey(usernameCacheKey(platform, username));
}

export async function writeInboxProfileCacheByUsername(
  platform: 'instagram' | 'facebook',
  username: string,
  data: InboxProfileCacheEntry
): Promise<void> {
  await writeInboxProfileCacheByKey(usernameCacheKey(platform, username), data);
}

async function readInboxProfileCacheByKey(key: string): Promise<InboxProfileCacheEntry | null> {
  try {
    const { prisma: db } = await import('@/lib/db');
    const rows = await db.$queryRaw<Array<{ value: string; expiresAt: Date | null }>>`
      SELECT value, "expiresAt" FROM app_kv WHERE key = ${key} LIMIT 1
    `;
    if (!rows[0]) return null;
    if (rows[0].expiresAt && rows[0].expiresAt < new Date()) return null;
    return JSON.parse(rows[0].value) as InboxProfileCacheEntry;
  } catch {
    return null;
  }
}

async function writeInboxProfileCacheByKey(key: string, data: InboxProfileCacheEntry): Promise<void> {
  try {
    const { prisma: db } = await import('@/lib/db');
    const expiresAt = new Date(Date.now() + PROFILE_CACHE_TTL_MS);
    await db.$executeRaw`
      INSERT INTO app_kv (key, value, "expiresAt", "updatedAt")
      VALUES (${key}, ${JSON.stringify(data)}, ${expiresAt}, now())
      ON CONFLICT (key) DO UPDATE
        SET value = ${JSON.stringify(data)}, "expiresAt" = ${expiresAt}, "updatedAt" = now()
    `;
  } catch {
    /* non-critical */
  }
}

export async function readInboxProfileCache(
  platform: 'instagram' | 'facebook',
  userId: string
): Promise<InboxProfileCacheEntry | null> {
  return readInboxProfileCacheByKey(cacheKey(platform, userId));
}

export async function writeInboxProfileCache(
  platform: 'instagram' | 'facebook',
  userId: string,
  data: InboxProfileCacheEntry
): Promise<void> {
  await writeInboxProfileCacheByKey(cacheKey(platform, userId), data);
  if (data.username) {
    await writeInboxProfileCacheByUsername(platform, data.username, data);
  }
}
