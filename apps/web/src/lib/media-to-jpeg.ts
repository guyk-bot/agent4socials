/**
 * Convert image buffer to JPEG for Instagram (Meta requires JPEG only).
 * Handles PNG, WebP, GIF; detects format by magic bytes when Content-Type is wrong.
 * Enforces 8MB limit (Meta rejects larger).
 */
import sharp from 'sharp';

const META_IMAGE_MAX_BYTES = 8 * 1024 * 1024; // 8MB
const IMAGE_TYPES = ['image/png', 'image/webp', 'image/gif'];

function isJpegByMagic(buf: Buffer): boolean {
  return buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
}
function isPngByMagic(buf: Buffer): boolean {
  return buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
}
function isGifByMagic(buf: Buffer): boolean {
  return buf.length >= 6 && buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46;
}
function isWebpByMagic(buf: Buffer): boolean {
  return buf.length >= 12 && buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 && buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50;
}

function needsConversion(buffer: Buffer, contentType: string): boolean {
  const ct = contentType?.split(';')[0]?.trim().toLowerCase();
  if (ct === 'image/jpeg' || isJpegByMagic(buffer)) return false;
  if (IMAGE_TYPES.includes(ct)) return true;
  if (ct === 'application/octet-stream' || !ct) {
    return isPngByMagic(buffer) || isGifByMagic(buffer) || isWebpByMagic(buffer);
  }
  return false;
}

async function toJpegWithinLimit(buffer: Buffer, quality = 92): Promise<Buffer> {
  let out = await sharp(buffer)
    .flatten({ background: { r: 255, g: 255, b: 255 } })
    .jpeg({ quality, mozjpeg: true })
    .toBuffer();
  if (out.length <= META_IMAGE_MAX_BYTES) return out;
  const meta = await sharp(buffer).metadata();
  const w = meta.width ?? 4096;
  const h = meta.height ?? 4096;
  const scale = Math.sqrt(META_IMAGE_MAX_BYTES / out.length);
  const newW = Math.max(320, Math.floor(w * scale * 0.95));
  const newH = Math.max(320, Math.floor(h * scale * 0.95));
  out = await sharp(buffer)
    .resize(newW, newH, { fit: 'inside', withoutEnlargement: true })
    .flatten({ background: { r: 255, g: 255, b: 255 } })
    .jpeg({ quality: 88, mozjpeg: true })
    .toBuffer();
  if (out.length <= META_IMAGE_MAX_BYTES) return out;
  for (const q of [80, 70, 60, 50]) {
    out = await sharp(buffer)
      .resize(newW, newH, { fit: 'inside', withoutEnlargement: true })
      .flatten({ background: { r: 255, g: 255, b: 255 } })
      .jpeg({ quality: q, mozjpeg: true })
      .toBuffer();
    if (out.length <= META_IMAGE_MAX_BYTES) return out;
  }
  return out;
}

export async function convertToJpegIfNeeded(
  buffer: Buffer,
  contentType: string
): Promise<{ buffer: Buffer; contentType: string }> {
  if (!needsConversion(buffer, contentType)) {
    if (buffer.length <= META_IMAGE_MAX_BYTES) return { buffer, contentType: 'image/jpeg' };
    const out = await toJpegWithinLimit(buffer, 85);
    return { buffer: out, contentType: 'image/jpeg' };
  }
  const jpeg = await toJpegWithinLimit(buffer);
  return { buffer: jpeg, contentType: 'image/jpeg' };
}
