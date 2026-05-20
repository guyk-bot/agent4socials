/**
 * Fetch image, fit to 9:16 story size, upload JPEG to R2 for Meta story publish.
 */
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { randomUUID } from 'crypto';
import { convertToJpegIfNeeded } from './media-to-jpeg';
import { fitImageBufferToStory } from './story-image-fit';

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

/** Fit to story aspect, upload to R2; returns direct URL or null if unavailable. */
export async function ensureStoryJpegOnR2(
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
      headers: { Accept: '*/*', 'User-Agent': 'Mozilla/5.0 (compatible; Meta-Story/1.0)' },
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
  const storyJpeg = await fitImageBufferToStory(jpeg);

  const key = `uploads/story-${randomUUID()}.jpg`;
  try {
    await s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: storyJpeg,
        ContentType: 'image/jpeg',
      })
    );
  } catch {
    return null;
  }
  return buildPublicUrl(key);
}
