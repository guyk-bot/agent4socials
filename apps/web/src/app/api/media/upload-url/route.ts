import { NextRequest, NextResponse } from 'next/server';
import { getPrismaUserIdFromRequest } from '@/lib/get-prisma-user';
import { createMediaPresignedPut, isMediaStorageConfigured, sanitizeMediaFileName } from '@/lib/media-storage';

export const maxDuration = 30;

export async function POST(request: NextRequest) {
  const userId = await getPrismaUserIdFromRequest(request.headers.get('authorization'));
  if (!userId) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  if (!isMediaStorageConfigured()) {
    return NextResponse.json(
      {
        message:
          'Media storage is not configured. Set S3_ENDPOINT, S3_BUCKET_NAME, S3_ACCESS_KEY_ID, and S3_SECRET_ACCESS_KEY.',
      },
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

  try {
    const signed = await createMediaPresignedPut(sanitizeMediaFileName(fileName), contentType);
    if (!signed) {
      return NextResponse.json({ message: 'Could not generate upload URL' }, { status: 500 });
    }
    return NextResponse.json(signed);
  } catch (err) {
    console.error('Error generating upload URL:', err);
    return NextResponse.json({ message: 'Could not generate upload URL' }, { status: 500 });
  }
}
