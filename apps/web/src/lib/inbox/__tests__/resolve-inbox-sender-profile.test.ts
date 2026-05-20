/** @jest-environment node */

import axios from 'axios';
import {
  isLikelyMetaScopedUserId,
  resolveInstagramInboxSenderProfile,
} from '../resolve-inbox-sender-profile';
import { readInboxProfileCache, writeInboxProfileCache } from '../inbox-profile-cache';

jest.mock('axios');
jest.mock('../inbox-profile-cache', () => ({
  readInboxProfileCache: jest.fn(),
  writeInboxProfileCache: jest.fn(),
}));
jest.mock('@/lib/meta-usage-guard', () => ({
  shouldAllowMetaInboxProfileEnrichment: jest.fn().mockReturnValue(true),
  noteMetaUsageFromHeaders: jest.fn(),
}));
jest.mock('@/lib/db', () => ({
  prisma: {
    socialAccount: {
      findFirst: jest.fn().mockResolvedValue({ accessToken: 'page-token-xyz' }),
    },
  },
}));

const mockedAxios = axios as jest.Mocked<typeof axios>;
const readCache = readInboxProfileCache as jest.Mock;
const writeCache = writeInboxProfileCache as jest.Mock;

describe('isLikelyMetaScopedUserId', () => {
  it('accepts numeric IGSID-style ids', () => {
    expect(isLikelyMetaScopedUserId('17841400000000000')).toBe(true);
  });
  it('rejects non-numeric ids that cause InvalidID', () => {
    expect(isLikelyMetaScopedUserId('not-a-user')).toBe(false);
    expect(isLikelyMetaScopedUserId('')).toBe(false);
  });
});

describe('resolveInstagramInboxSenderProfile', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    readCache.mockResolvedValue(null);
    writeCache.mockResolvedValue(undefined);
    mockedAxios.get.mockReset();
  });

  it('returns cached profile when picture is already stored', async () => {
    readCache.mockResolvedValue({
      name: 'Naama',
      username: 'naama',
      pictureUrl: 'https://cdn.example/avatar.jpg',
    });
    const profile = await resolveInstagramInboxSenderProfile({
      userId: 'u1',
      senderId: '123',
      accessToken: 'token',
      isInstagramBusinessLogin: false,
    });
    expect(profile?.pictureUrl).toBe('https://cdn.example/avatar.jpg');
    expect(mockedAxios.get).not.toHaveBeenCalled();
  });

  it('uses Page token User Profile API (profile_pic string, no platform param)', async () => {
    mockedAxios.get.mockResolvedValueOnce({
      data: {
        name: 'Naama',
        username: 'naama',
        profile_pic: 'https://fbcdn-profile.example/pic.jpg',
      },
    });
    const senderId = '17841400000000123';
    const profile = await resolveInstagramInboxSenderProfile({
      userId: 'u1',
      senderId,
      accessToken: 'ig-token',
      isInstagramBusinessLogin: false,
    });
    expect(profile?.pictureUrl).toBe('https://fbcdn-profile.example/pic.jpg');
    expect(mockedAxios.get).toHaveBeenCalledWith(
      expect.stringContaining(`/${senderId}`),
      expect.objectContaining({
        params: expect.objectContaining({
          fields: 'name,username,profile_pic',
          access_token: 'page-token-xyz',
        }),
      })
    );
    expect(mockedAxios.get.mock.calls[0][1]?.params?.platform).toBeUndefined();
    expect(writeCache).toHaveBeenCalledWith(
      'instagram',
      senderId,
      expect.objectContaining({ pictureUrl: 'https://fbcdn-profile.example/pic.jpg' })
    );
  });
});
