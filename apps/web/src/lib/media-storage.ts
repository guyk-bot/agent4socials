import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'crypto';

export function isMediaStorageConfigured(): boolean {
  return Boolean(
    process.env.S3_ENDPOINT &&
      process.env.S3_BUCKET_NAME &&
      process.env.S3_ACCESS_KEY_ID &&
      process.env.S3_SECRET_ACCESS_KEY
  );
}

export function getMediaS3Client(): S3Client | null {
  const endpoint = process.env.S3_ENDPOINT;
  const bucket = process.env.S3_BUCKET_NAME;
  const accessKey = process.env.S3_ACCESS_KEY_ID;
  const secretKey = process.env.S3_SECRET_ACCESS_KEY;
  if (!endpoint || !bucket || !accessKey || !secretKey) return null;
  return new S3Client({
    region: process.env.S3_REGION || 'auto',
    credentials: { accessKeyId: accessKey, secretAccessKey: secretKey },
    endpoint,
    forcePathStyle: true,
  });
}

export function sanitizeMediaFileName(fileName: string): string {
  return fileName.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 200) || 'file';
}

export function buildMediaObjectKey(fileName: string): string {
  return `uploads/${randomUUID()}-${sanitizeMediaFileName(fileName)}`;
}

/** Public URL for an object key (R2 dev host vs path-style bucket). */
export function buildMediaPublicUrl(key: string): string | null {
  const baseUrl = process.env.S3_PUBLIC_URL?.trim() || process.env.S3_ENDPOINT?.trim() || '';
  const bucket = process.env.S3_BUCKET_NAME;
  if (!baseUrl || !bucket) return null;
  const base = baseUrl.replace(/\/$/, '');
  const isR2Dev = base.includes('r2.dev');
  return isR2Dev ? `${base}/${key}` : `${base}/${bucket}/${key}`;
}

export async function uploadMediaBuffer(
  key: string,
  body: Buffer | Uint8Array,
  contentType: string
): Promise<string | null> {
  const s3 = getMediaS3Client();
  const bucket = process.env.S3_BUCKET_NAME;
  if (!s3 || !bucket) return null;
  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
    })
  );
  return buildMediaPublicUrl(key);
}

export async function createMediaPresignedPut(
  fileName: string,
  contentType: string
): Promise<{ uploadUrl: string; fileUrl: string; key: string } | null> {
  const s3 = getMediaS3Client();
  const bucket = process.env.S3_BUCKET_NAME;
  if (!s3 || !bucket) return null;
  const key = buildMediaObjectKey(fileName);
  const uploadUrl = await getSignedUrl(
    s3,
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      ContentType: contentType,
    }),
    { expiresIn: 3600 }
  );
  const fileUrl = buildMediaPublicUrl(key);
  if (!fileUrl) return null;
  return { uploadUrl, fileUrl, key };
}
