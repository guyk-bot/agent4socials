export type AysopChatAttachmentKind = 'image' | 'video' | 'file';

export type AysopChatAttachment = {
  fileUrl: string;
  fileName: string;
  contentType?: string;
  kind: AysopChatAttachmentKind;
};

export const AYSOP_CHAT_MAX_ATTACHMENTS = 4;
export const AYSOP_CHAT_MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const AYSOP_CHAT_MAX_VIDEO_BYTES = 100 * 1024 * 1024;
export const AYSOP_CHAT_MAX_FILE_BYTES = 25 * 1024 * 1024;

export const AYSOP_CHAT_FILE_ACCEPT =
  'image/jpeg,image/png,image/gif,image/webp,image/heic,image/heif,video/mp4,video/quicktime,video/webm,video/x-msvideo,.pdf,.doc,.docx,.txt,.csv,.xls,.xlsx,.ppt,.pptx';

export function attachmentKindFromMime(mime: string, fileName: string): AysopChatAttachmentKind {
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  const lower = fileName.toLowerCase();
  if (/\.(jpe?g|png|gif|webp|heic|heif|bmp|svg)$/.test(lower)) return 'image';
  if (/\.(mp4|mov|webm|avi|mkv|m4v)$/.test(lower)) return 'video';
  return 'file';
}

export function maxBytesForKind(kind: AysopChatAttachmentKind): number {
  if (kind === 'image') return AYSOP_CHAT_MAX_IMAGE_BYTES;
  if (kind === 'video') return AYSOP_CHAT_MAX_VIDEO_BYTES;
  return AYSOP_CHAT_MAX_FILE_BYTES;
}

export function validateChatFile(file: File): string | null {
  const kind = attachmentKindFromMime(file.type || '', file.name);
  const max = maxBytesForKind(kind);
  if (file.size > max) {
    const mb = Math.round(max / (1024 * 1024));
    return `${file.name} is too large (max ${mb} MB for ${kind === 'file' ? 'files' : kind + 's'}).`;
  }
  return null;
}

export function normalizeChatAttachments(raw: unknown): AysopChatAttachment[] {
  if (!Array.isArray(raw)) return [];
  const out: AysopChatAttachment[] = [];
  for (const row of raw) {
    if (!row || typeof row !== 'object') continue;
    const o = row as Record<string, unknown>;
    const fileUrl = typeof o.fileUrl === 'string' ? o.fileUrl.trim() : '';
    const fileName = typeof o.fileName === 'string' ? o.fileName.trim() : '';
    if (!fileUrl || !fileName) continue;
    const kindRaw = o.kind;
    const kind: AysopChatAttachmentKind =
      kindRaw === 'image' || kindRaw === 'video' || kindRaw === 'file'
        ? kindRaw
        : attachmentKindFromMime(typeof o.contentType === 'string' ? o.contentType : '', fileName);
    out.push({
      fileUrl,
      fileName,
      contentType: typeof o.contentType === 'string' ? o.contentType : undefined,
      kind,
    });
  }
  return out.slice(0, AYSOP_CHAT_MAX_ATTACHMENTS);
}
