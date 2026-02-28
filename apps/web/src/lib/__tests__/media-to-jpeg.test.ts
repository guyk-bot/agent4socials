import { convertToJpegIfNeeded } from '../media-to-jpeg';

describe('media-to-jpeg', () => {
  it('returns JPEG buffer when input is PNG', async () => {
    const minimalPng = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      'base64'
    );
    const result = await convertToJpegIfNeeded(minimalPng, 'image/png');
    expect(result.contentType).toBe('image/jpeg');
    expect(Buffer.isBuffer(result.buffer)).toBe(true);
    expect(result.buffer.length).toBeGreaterThan(0);
  });

  it('returns buffer unchanged when input is already JPEG', async () => {
    const jpegHeader = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
    const result = await convertToJpegIfNeeded(jpegHeader, 'image/jpeg');
    expect(result.contentType).toBe('image/jpeg');
    expect(result.buffer).toBe(jpegHeader);
  });

  it('output is valid JPEG (starts with FFD8FF)', async () => {
    const minimalPng = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      'base64'
    );
    const result = await convertToJpegIfNeeded(minimalPng, 'image/png');
    expect(result.buffer[0]).toBe(0xff);
    expect(result.buffer[1]).toBe(0xd8);
    expect(result.buffer[2]).toBe(0xff);
  });
});
