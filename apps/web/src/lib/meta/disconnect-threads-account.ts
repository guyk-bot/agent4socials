import { prisma } from '@/lib/db';

/** Remove Threads connection(s) for a Meta app-scoped user id from deauthorize / data-deletion callbacks. */
export async function disconnectThreadsByPlatformUserId(platformUserId: string): Promise<number> {
  const id = platformUserId.trim();
  if (!id) return 0;
  const result = await prisma.socialAccount.deleteMany({
    where: { platform: 'THREADS', platformUserId: id },
  });
  return result.count;
}
