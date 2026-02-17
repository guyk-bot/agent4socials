import { NextRequest, NextResponse } from 'next/server';
import { getPrismaUserIdFromRequest } from '@/lib/get-prisma-user';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'crypto';

export async function POST(request: NextRequest) {
  const userId = await getPrismaUserIdFromRequest(request.headers.get('authorization'));
  if (!userId) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const endpoint = process.env.S3_ENDPOINT;
  const bucket = process.env.S3_BUCKET_NAME;
  const accessKey = process.env.S3_ACCESS_KEY_ID;
  const secretKey = process.env.S3_SECRET_ACCESS_KEY;
  if (!endpoint || !bucket || !accessKey || !secretKey) {
    return NextResponse.json(
      { message: 'Media storage is not configured. Set S3_ENDPOINT, S3_BUCKET_NAME, S3_ACCESS_KEY_ID, and S3_SECRET_ACCESS_KEY.' },
      { status: 503 }
    );
  }

  let body: { fileName?: string; contentType?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: 'Invalid JSON' }, { status: 400 });
  }
  const fileName = typeof body?.fileName === 'string' ? body.fileName.trim() : '';
  const contentType = typeof body?.contentType === 'string' ? body.contentType.trim() : 'application/octet-stream';
  if (!fileName) {
    return NextResponse.json({ message: 'fileName is required' }, { status: 400 });
  }

  const sanitized = fileName.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 200) || 'file';
  const key = `uploads/${randomUUID()}-${sanitized}`;

  const s3 = new S3Client({
    region: process.env.S3_REGION || 'auto',
    credentials: { accessKeyId: accessKey, secretAccessKey: secretKey },
    endpoint,
    forcePathStyle: true,
  });

  try {
    const url = await getSignedUrl(
      s3,
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        ContentType: contentType,
      }),
      { expiresIn: 3600 }
    );
    const baseUrl = process.env.S3_PUBLIC_URL || endpoint || '';
    // R2 Public Development URL (pub-xxx.r2.dev) is bucket-specific: path is key only, not bucket/key
    const isR2Dev = baseUrl.includes('r2.dev');
    const fileUrl = baseUrl
      ? `${baseUrl.replace(/\/$/, '')}${isR2Dev ? `/${key}` : `/${bucket}/${key}`}`
      : key;
    return NextResponse.json({ uploadUrl: url, fileUrl, key });
  } catch (err) {
    console.error('Error generating upload URL:', err);
    return NextResponse.json({ message: 'Could not generate upload URL' }, { status: 500 });
  }
}
