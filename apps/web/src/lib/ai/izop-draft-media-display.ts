/** Preview URLs for chat post drafts (R2 + external). */
export function draftMediaDisplayUrl(url: string | null | undefined): string {
  if (!url || typeof url !== 'string') return '';
  const trimmed = url.trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('/api/')) return trimmed;
  if (trimmed.startsWith('http')) {
    return `/api/media/proxy?url=${encodeURIComponent(trimmed)}`;
  }
  return trimmed;
}
