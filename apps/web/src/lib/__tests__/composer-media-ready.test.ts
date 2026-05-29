/** @jest-environment node */

import {
  filterPersistableComposerMedia,
  getComposerMediaNotReadyReason,
} from '../composer-media-ready';

describe('composer-media-ready', () => {
  const base = {
    mediaType: 'video',
    mediaUploading: false,
    thumbnailPicking: false,
    storyCropOpen: false,
    platforms: ['LINKEDIN'],
    mediaList: [{ fileUrl: 'https://cdn.example.com/v.mp4', type: 'VIDEO' }],
    mediaByPlatform: {},
    differentMediaPerPlatform: false,
  };

  it('blocks while uploading', () => {
    expect(getComposerMediaNotReadyReason({ ...base, mediaUploading: true })).toMatch(/uploading/i);
  });

  it('blocks blob preview URLs', () => {
    expect(
      getComposerMediaNotReadyReason({
        ...base,
        mediaList: [{ fileUrl: 'blob:http://localhost/abc', type: 'VIDEO' }],
      })
    ).toMatch(/uploading/i);
  });

  it('allows https media', () => {
    expect(getComposerMediaNotReadyReason(base)).toBeNull();
  });

  it('filters non-persistable items', () => {
    const items = [
      { fileUrl: 'blob:x', type: 'IMAGE' },
      { fileUrl: 'https://cdn.example.com/a.jpg', type: 'IMAGE' },
    ];
    expect(filterPersistableComposerMedia(items)).toHaveLength(1);
  });
});
