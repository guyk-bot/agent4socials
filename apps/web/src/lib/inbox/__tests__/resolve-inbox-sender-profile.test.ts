/** @jest-environment node */

import { resolveInstagramInboxSenderProfile } from '../resolve-inbox-sender-profile';
import { readInboxProfileCache, writeInboxProfileCache } from '../inbox-profile-cache';

jest.mock('../inbox-profile-cache', () => ({
  readInboxProfileCache: jest.fn(),
  writeInboxProfileCache: jest.fn(),
}));

jest.mock('axios');

const axios = jest.requireMock('axios') as { get: jest.Mock };
const readCache = readInboxProfileCache as jest.Mock;
const writeCache = writeInboxProfileCache as jest.Mock;

describe('resolveInstagramInboxSenderProfile', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    readCache.mockResolvedValue(null);
    writeCache.mockResolvedValue(undefined);
  });

  it('returns cached profile when picture is already stored', async () => {
    readCache.mockResolvedValue({
      name: 'Naama',
      username: 'naama',
      pictureUrl: 'https://cdn.example/avatar.jpg',
    });
    const profile = await resolveInstagramInboxSenderProfile({
      senderId: '123',
      accessToken: 'token',
      isInstagramBusinessLogin: true,
    });
    expect(profile?.pictureUrl).toBe('https://cdn.example/avatar.jpg');
    expect(axios.get).not.toHaveBeenCalled();
  });

  it('reads profile_picture_url from Instagram Graph user node', async () => {
    axios.get.mockResolvedValue({
      data: {
        name: 'Naama',
        username: 'naama',
        profile_picture_url: 'https://cdn.example/ig.jpg',
      },
    });
    const profile = await resolveInstagramInboxSenderProfile({
      senderId: '123',
      accessToken: 'token',
      isInstagramBusinessLogin: true,
    });
    expect(profile?.pictureUrl).toBe('https://cdn.example/ig.jpg');
    expect(writeCache).toHaveBeenCalledWith('instagram', '123', expect.objectContaining({
      pictureUrl: 'https://cdn.example/ig.jpg',
    }));
  });
});
