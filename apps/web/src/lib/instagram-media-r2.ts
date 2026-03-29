/**
 * For Instagram: fetch image, convert to JPEG, upload to R2, return direct public URL.
 * Meta often fails (2207076) when fetching via proxy/serve; direct R2 URLs are more reliable.
 * Key is ASCII-only to avoid Meta 2207052 (non-ASCII in URL).
 */
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { randomUUID } from 'crypto';
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

/** Only fetch from our own R2; avoids abuse and ensures we control the source. */
function isUnderS3PublicUrl(url: string): boolean {
  const base = process.env.S3_PUBLIC_URL?.trim();
  if (!base) return false;
  try {
    const baseOrigin = new URL(base.replace(/\/$/, '')).origin;
    const urlOrigin = new URL(url).origin;
    return urlOrigin === baseOrigin;
  } catch {
    return false;
  }
}

/**
 * Fetch image from URL, convert to JPEG (Meta requirement), upload to R2, return direct public URL.
 * Meta often fails with 2207076 when fetching via proxy; direct R2 URLs (ASCII, no query params) are more reliable.
 * Falls back to null if S3/R2 not configured; caller should use proxy/serve in that case.
 */
export async function ensureInstagramJpegOnR2(
  sourceUrl: string,
  fetchFn: typeof globalThis.fetch
): Promise<string | null> {
  const s3 = getS3Client();
  const publicBase = process.env.S3_PUBLIC_URL?.trim();
  const bucket = process.env.S3_BUCKET_NAME;
  if (!s3 || !bucket || !publicBase) return null;
  if (!sourceUrl.startsWith('http') || !isUnderS3PublicUrl(sourceUrl)) return null;

  let res: Response;
  try {
    res = await fetchFn(sourceUrl, {
      method: 'GET',
      headers: { Accept: '*/*', 'User-Agent': 'Mozilla/5.0 (compatible; Meta-Instagram/1.0)' },
      cache: 'no-store',
      signal: AbortSignal.timeout(30_000),
    });
  } catch {
    return null;
  }
  if (!res.ok) return null;

  const contentType = res.headers.get('content-type')?.split(';')[0]?.trim() || 'application/octet-stream';
  const buf = Buffer.from(await res.arrayBuffer());
  const { buffer: jpeg } = await convertToJpegIfNeeded(buf, contentType);

  const key = `uploads/ig-${randomUUID()}.jpg`;
  try {
    await s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: jpeg,
        ContentType: 'image/jpeg',
      })
    );
  } catch {
    return null;
  }

  return buildPublicUrl(key);
}
