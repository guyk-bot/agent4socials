import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { verifyMediaServeToken } from '@/lib/media-serve-token';

function getS3Client(): S3Client | null {
  const endpoint = process.env.S3_ENDPOINT;
  const accessKey = process.env.S3_ACCESS_KEY_ID;
  const secretKey = process.env.S3_SECRET_ACCESS_KEY;
  if (!endpoint || !accessKey || !secretKey) return null;
  return new S3Client({
    region: process.env.S3_REGION || 'auto',
    credentials: { accessKeyId: accessKey, secretAccessKey: secretKey },
    endpoint,
    forcePathStyle: true,
  });
}

/** Map a public R2 URL back to bucket key for server-side GetObject (faster than HTTP loopback). */
function s3KeyFromPublicUrl(url: string): string | null {
  const base = process.env.S3_PUBLIC_URL?.trim();
  const bucket = process.env.S3_BUCKET_NAME;
  if (!base || !bucket) return null;
  try {
    const parsed = new URL(url);
    const baseUrl = new URL(base.replace(/\/$/, ''));
    if (parsed.origin !== baseUrl.origin) return null;
    const prefix = baseUrl.pathname.replace(/\/$/, '');
    let path = parsed.pathname;
    if (prefix && path.startsWith(prefix)) path = path.slice(prefix.length);
    if (path.startsWith('/')) path = path.slice(1);
    if (base.includes('r2.dev')) return path || null;
    if (path.startsWith(`${bucket}/`)) return path.slice(bucket.length + 1);
    return path || null;
  } catch {
    return null;
  }
}

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

/** Fetch video/image bytes for publish (S3 direct when possible, else HTTPS). */
export async function fetchPublishMediaBuffer(
  fileUrl: string,
  fetchFn: typeof globalThis.fetch = fetch
): Promise<{ buffer: Buffer; contentType: string }> {
  const directUrl = resolveDirectPublishMediaUrl(fileUrl);
  const key = isDirectPublishMediaUrl(directUrl) ? s3KeyFromPublicUrl(directUrl) : null;
  const bucket = process.env.S3_BUCKET_NAME;
  const s3 = key && bucket ? getS3Client() : null;
  if (s3 && key) {
    try {
      const out = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
      const body = out.Body;
      if (body) {
        const bytes = await body.transformToByteArray();
        const buffer = Buffer.from(bytes);
        const contentType =
          typeof out.ContentType === 'string' && out.ContentType.trim()
            ? out.ContentType
            : 'video/mp4';
        return { buffer, contentType };
      }
    } catch (e) {
      console.warn('[fetchPublishMediaBuffer] S3 GetObject failed, falling back to HTTP', {
        key,
        message: (e as Error)?.message,
      });
    }
  }
  const res = await fetchFn(directUrl, {
    redirect: 'follow',
    signal: AbortSignal.timeout(300_000),
    headers: { Accept: 'video/*,application/octet-stream,*/*' },
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch media (${res.status}). Try a shorter clip or reconnect and retry.`);
  }
  const buffer = Buffer.from(await res.arrayBuffer());
  const contentType = res.headers.get('content-type') || 'video/mp4';
  return { buffer, contentType };
}
