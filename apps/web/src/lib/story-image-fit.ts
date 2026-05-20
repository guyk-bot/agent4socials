/**
 * Fit images to Story dimensions (9:16, 1080×1920) for Instagram and Facebook Stories.
 */
import sharp from 'sharp';
import { STORY_OUTPUT_HEIGHT, STORY_OUTPUT_WIDTH } from './story-image-constants';

/** Center-crop and resize to 1080×1920 JPEG (Meta story recommendation). */
export async function fitImageBufferToStory(buffer: Buffer): Promise<Buffer> {
  const pipeline = sharp(buffer).rotate();
  const meta = await pipeline.metadata();
  const w = meta.width ?? 0;
  const h = meta.height ?? 0;

  // Composer crop already exports 1080×1920 (including letterboxing). Do not re-crop.
  if (w === STORY_OUTPUT_WIDTH && h === STORY_OUTPUT_HEIGHT) {
    return pipeline.jpeg({ quality: 92, mozjpeg: true }).toBuffer();
  }

  const targetAspect = STORY_OUTPUT_WIDTH / STORY_OUTPUT_HEIGHT;
  const aspect = w > 0 && h > 0 ? w / h : 0;
  if (aspect > 0 && Math.abs(aspect - targetAspect) < 0.02) {
    return pipeline
      .resize(STORY_OUTPUT_WIDTH, STORY_OUTPUT_HEIGHT, {
        fit: 'contain',
        background: { r: 0, g: 0, b: 0 },
      })
      .jpeg({ quality: 92, mozjpeg: true })
      .toBuffer();
  }

  return pipeline
    .resize(STORY_OUTPUT_WIDTH, STORY_OUTPUT_HEIGHT, { fit: 'cover', position: 'centre' })
    .jpeg({ quality: 92, mozjpeg: true })
    .toBuffer();
}
