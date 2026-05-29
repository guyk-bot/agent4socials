/**
 * Local snapshots for History rows with id `pending-*` (optimistic POSTING before API returns).
 * Lets "Open in Composer" restore the attempt when create/publish failed server-side.
 */

const PENDING_SNAPSHOT_PREFIX = 'agent4socials_pending_post_';

export type ComposerPendingSnapshot = {
  platforms: string[];
  content: string;
  contentByPlatform: Record<string, string>;
  differentContentPerPlatform: boolean;
  mediaType: string;
  mediaList: { fileUrl: string; type: 'IMAGE' | 'VIDEO'; thumbnailUrl?: string }[];
  mediaByPlatform: Record<string, { fileUrl: string; type: 'IMAGE' | 'VIDEO'; thumbnailUrl?: string }[]>;
  differentMediaPerPlatform: boolean;
  differentThumbnailPerPlatform?: boolean;
  thumbnailByPlatform?: Record<string, string>;
  thumbnailChoice?: 'none' | 'upload' | 'frame';
  scheduledAt?: string;
  scheduleDelivery?: 'auto' | 'email_links';
  selectedHashtags?: string[];
  differentHashtagsPerPlatform?: boolean;
  selectedHashtagsByPlatform?: Record<string, string[]>;
  commentAutomationEnabled?: boolean;
  commentAutomationKeywords?: string;
  commentAutomationReplyTemplate?: string;
  commentAutomationReplyByPlatform?: Record<string, string>;
  commentAutomationReplyOnComment?: boolean;
  commentAutomationInstagramPublicReply?: boolean;
  commentAutomationInstagramPrivateReply?: boolean;
  commentAutomationInstagramDmMessage?: string;
  commentAutomationTagCommenter?: boolean;
  tiktokPublishByAccountId?: Record<string, unknown>;
  linkedInVisibility?: 'PUBLIC' | 'CONNECTIONS';
  threadsShareToInstagram?: boolean;
  alsoPostToStory?: boolean;
};

export function isPendingHistoryPostId(id: string | null | undefined): boolean {
  return typeof id === 'string' && id.startsWith('pending-');
}

export function savePendingPostSnapshot(postId: string, snapshot: ComposerPendingSnapshot): void {
  if (typeof window === 'undefined' || !isPendingHistoryPostId(postId)) return;
  try {
    localStorage.setItem(`${PENDING_SNAPSHOT_PREFIX}${postId}`, JSON.stringify(snapshot));
  } catch {
    /* ignore quota */
  }
}

export function readPendingPostSnapshot(postId: string): ComposerPendingSnapshot | null {
  if (typeof window === 'undefined' || !isPendingHistoryPostId(postId)) return null;
  try {
    const raw = localStorage.getItem(`${PENDING_SNAPSHOT_PREFIX}${postId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ComposerPendingSnapshot;
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

export function removePendingPostSnapshot(postId: string): void {
  if (typeof window === 'undefined' || !isPendingHistoryPostId(postId)) return;
  try {
    localStorage.removeItem(`${PENDING_SNAPSHOT_PREFIX}${postId}`);
  } catch {
    /* ignore */
  }
}
