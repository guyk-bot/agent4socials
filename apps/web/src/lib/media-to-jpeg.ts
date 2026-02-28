/**
 * Convert image buffer to JPEG for Instagram (Meta requires JPEG only).
 * Uses sharp; @img/sharp-linux-x64 in optionalDeps for Vercel.
 */
import sharp from 'sharp';

const IMAGE_TYPES = ['image/png', 'image/webp', 'image/gif'];

export async function convertToJpegIfNeeded(
  buffer: Buffer,
  contentType: string
): Promise<{ buffer: Buffer; contentType: string }> {
  const ct = contentType?.split(';')[0]?.trim().toLowerCase();
  if (!ct || !IMAGE_TYPES.includes(ct)) {
    return { buffer, contentType: ct || 'image/jpeg' };
  }
  const jpeg = await sharp(buffer)
    .flatten({ background: { r: 255, g: 255, b: 255 } })
    .jpeg({ quality: 92, mozjpeg: true })
    .toBuffer();
  return { buffer: jpeg, contentType: 'image/jpeg' };
}
