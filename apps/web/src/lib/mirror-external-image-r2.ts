/**
 * Fetch an external image (e.g. TikTok CDN) and store on R2 for stable <img src> URLs.
 */
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { convertToJpegIfNeeded } from './media-to-jpeg';

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

function buildPublicUrl(key: string): string | null {
  const baseUrl = process.env.S3_PUBLIC_URL?.trim();
  const bucket = process.env.S3_BUCKET_NAME;
  if (!baseUrl || !bucket) return null;
  const base = baseUrl.replace(/\/$/, '');
  const isR2Dev = base.includes('r2.dev');
  return isR2Dev ? `${base}/${key}` : `${base}/${bucket}/${key}`;
}

/** True when url is already served from our R2 / S3 public base (no proxy needed). */
export function isHostedAvatarUrl(url: string): boolean {
  const base = process.env.S3_PUBLIC_URL?.trim() || process.env.NEXT_PUBLIC_S3_PUBLIC_URL?.trim();
  if (!base) return false;
  try {
    return new URL(url).origin === new URL(base.replace(/\/$/, '')).origin;
  } catch {
    return false;
  }
}

function fetchHeadersForSource(sourceUrl: string): Record<string, string> {
  const isTikTokCdn = /tiktokcdn|tiktokv\.com|byteimg\.com|muscdn\.com/i.test(sourceUrl);
  return {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
    ...(isTikTokCdn ? { Referer: 'https://www.tiktok.com/' } : {}),
  };
}

/**
 * Download `sourceUrl` and upload to R2 at `objectKey` (e.g. avatars/tiktok/{accountId}.jpg).
 * Returns the public URL, or null if R2 is not configured or the download fails.
 */
export async function mirrorExternalImageToR2(
  sourceUrl: string,
  objectKey: string
): Promise<string | null> {
  if (!sourceUrl.startsWith('http')) return null;
  const s3 = getS3Client();
  const bucket = process.env.S3_BUCKET_NAME;
  if (!s3 || !bucket) return null;

  let res: Response;
  try {
    res = await fetch(sourceUrl, {
      method: 'GET',
      headers: fetchHeadersForSource(sourceUrl),
      cache: 'no-store',
      redirect: 'follow',
      signal: AbortSignal.timeout(25_000),
    });
  } catch {
    return null;
  }
  if (!res.ok) return null;

  const contentType = res.headers.get('content-type')?.split(';')[0]?.trim() || 'application/octet-stream';
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 64) return null;

  let body: Buffer = buf;
  let uploadContentType = contentType;
  try {
    const converted = await convertToJpegIfNeeded(buf, contentType);
    body = converted.buffer;
    uploadContentType = 'image/jpeg';
  } catch {
    /* upload original bytes */
  }

  const key = objectKey.replace(/^\/+/, '');
  try {
    await s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: body,
        ContentType: uploadContentType,
        CacheControl: 'public, max-age=86400',
      })
    );
  } catch {
    return null;
  }

  return buildPublicUrl(key);
}

export function tiktokAvatarR2Key(socialAccountId: string): string {
  const safe = socialAccountId.replace(/[^a-zA-Z0-9_-]/g, '');
  return `avatars/tiktok/${safe || 'unknown'}.jpg`;
}
