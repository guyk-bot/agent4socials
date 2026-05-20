/**
 * Fit images to Story dimensions (9:16, 1080×1920) for Instagram and Facebook Stories.
 */
import sharp from 'sharp';
import { STORY_OUTPUT_HEIGHT, STORY_OUTPUT_WIDTH } from './story-image-constants';

/** Center-crop and resize to 1080×1920 JPEG (Meta story recommendation). */
export async function fitImageBufferToStory(buffer: Buffer): Promise<Buffer> {
  return sharp(buffer)
    .rotate()
    .resize(STORY_OUTPUT_WIDTH, STORY_OUTPUT_HEIGHT, { fit: 'cover', position: 'centre' })
    .jpeg({ quality: 92, mozjpeg: true })
    .toBuffer();
}
