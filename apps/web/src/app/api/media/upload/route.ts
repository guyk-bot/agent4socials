import { NextRequest, NextResponse } from 'next/server';
import { getPrismaUserIdFromRequest } from '@/lib/get-prisma-user';
import {
  buildMediaObjectKey,
  isMediaStorageConfigured,
  sanitizeMediaFileName,
  uploadMediaBuffer,
} from '@/lib/media-storage';

export const maxDuration = 60;
export const runtime = 'nodejs';

/** Same-origin upload: avoids browser CORS issues with presigned R2 PUT. */
// Vercel Hobby has 4.5MB body limit; Pro has 5MB. Stay under that threshold.
const MAX_BYTES = 4 * 1024 * 1024;

/** GET: health check to verify R2 is configured */
export async function GET() {
  const configured = isMediaStorageConfigured();
  return NextResponse.json({
    configured,
    message: configured
      ? 'Media storage is configured'
      : 'Media storage is NOT configured. Set S3_ENDPOINT, S3_BUCKET_NAME, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY in Vercel env vars.',
  });
}

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

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ message: 'Invalid upload body' }, { status: 400 });
  }

  const raw = formData.get('file');
  if (!(raw instanceof File)) {
    return NextResponse.json({ message: 'file is required' }, { status: 400 });
  }
  if (raw.size <= 0) {
    return NextResponse.json({ message: 'Empty file' }, { status: 400 });
  }
  if (raw.size > MAX_BYTES) {
    return NextResponse.json(
      { message: `File is too large for direct upload (max ${Math.round(MAX_BYTES / (1024 * 1024))} MB).` },
      { status: 413 }
    );
  }

  const contentType =
    raw.type?.split(';')[0]?.trim() ||
    (raw.name.toLowerCase().endsWith('.mp4') || raw.name.toLowerCase().endsWith('.mov')
      ? 'video/mp4'
      : 'application/octet-stream');
  const safeName = sanitizeMediaFileName(raw.name || 'upload.bin');
  const key = buildMediaObjectKey(safeName);

  try {
    const buffer = Buffer.from(await raw.arrayBuffer());
    const fileUrl = await uploadMediaBuffer(key, buffer, contentType);
    if (!fileUrl) {
      return NextResponse.json({ message: 'Could not store file' }, { status: 500 });
    }
    return NextResponse.json({ fileUrl, key });
  } catch (err) {
    console.error('[media/upload]', (err as Error)?.message ?? err);
    return NextResponse.json({ message: 'Upload failed on server' }, { status: 500 });
  }
}
