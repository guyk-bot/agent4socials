export const META_MESSAGING_WINDOW_MS = 24 * 60 * 60 * 1000;

export const META_MESSAGING_WINDOW_BLOCKED_MESSAGE =
  "Facebook and Instagram only allow replies within 24 hours of the customer's last message.";

type InboxMessageLike = { isFromPage?: boolean; createdTime?: string | null };

/** True when Meta's standard messaging window has closed for this thread. */
export function isMetaMessagingWindowClosed(
  platform: string,
  messages: InboxMessageLike[]
): boolean {
  const p = platform.toUpperCase();
  if (p !== 'INSTAGRAM' && p !== 'FACEBOOK') return false;
  const latestIncoming = [...messages]
    .filter((m) => !m.isFromPage && Boolean(m.createdTime))
    .sort((a, b) => new Date(b.createdTime ?? 0).getTime() - new Date(a.createdTime ?? 0).getTime())[0];
  if (!latestIncoming?.createdTime) return false;
  const ageMs = Date.now() - new Date(latestIncoming.createdTime).getTime();
  return Number.isFinite(ageMs) && ageMs > META_MESSAGING_WINDOW_MS;
}
