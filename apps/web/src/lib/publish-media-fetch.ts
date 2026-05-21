import { verifyMediaServeToken } from '@/lib/media-serve-token';

/** True when URL is our public R2 / S3 bucket (direct fetch, no app serve hop). */
export function isDirectPublishMediaUrl(url: string): boolean {
  if (!url?.startsWith('http')) return false;
  const base = process.env.S3_PUBLIC_URL?.trim();
  if (base) {
    try {
      if (new URL(url).origin === new URL(base.replace(/\/$/, '')).origin) return true;
    } catch (_) {}
  }
  try {
    const host = new URL(url).hostname;
    return /\.r2\.dev$/i.test(host) || /cloudflarestorage\.com$/i.test(host);
  } catch (_) {
    return false;
  }
}

/** Prefer direct R2 URL for platform uploads (TikTok FILE_UPLOAD, LinkedIn multipart). */
export function resolveDirectPublishMediaUrl(fileUrl: string): string {
  if (!fileUrl?.startsWith('http')) return fileUrl;
  if (isDirectPublishMediaUrl(fileUrl)) return fileUrl;
  try {
    const parsed = new URL(fileUrl);
    const token = parsed.searchParams.get('t');
    if (token && parsed.pathname.includes('/api/media/serve')) {
      const decoded = verifyMediaServeToken(token);
      if (decoded?.url?.startsWith('http')) return decoded.url;
    }
  } catch (_) {}
  if (fileUrl.startsWith('/api/media/')) {
    const appBase = (process.env.NEXT_PUBLIC_APP_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '')).replace(
      /\/$/,
      ''
    );
    if (appBase) return `${appBase}${fileUrl}`;
  }
  return fileUrl;
}
