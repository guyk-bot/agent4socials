import { prepareLinkedInOAuthConnect } from '../prepare-oauth-connect';

const revokeMock = jest.fn().mockResolvedValue(undefined);
const findFirstMock = jest.fn();
const findManyPendingMock = jest.fn();
const deleteManyPendingMock = jest.fn().mockResolvedValue({ count: 0 });

jest.mock('@/lib/linkedin/revoke-access-token', () => ({
  revokeLinkedInAccessToken: (...args: unknown[]) => revokeMock(...args),
}));

jest.mock('@/lib/db', () => ({
  prisma: {
    socialAccount: {
      findFirst: (...args: unknown[]) => findFirstMock(...args),
      findMany: jest.fn(),
    },
    pendingConnection: {
      findMany: (...args: unknown[]) => findManyPendingMock(...args),
      deleteMany: (...args: unknown[]) => deleteManyPendingMock(...args),
    },
  },
}));

describe('prepareLinkedInOAuthConnect', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    findManyPendingMock.mockResolvedValue([]);
    findFirstMock.mockResolvedValue(null);
  });

  it('does not load or revoke all LinkedIn social accounts on a new connect', async () => {
    const { prisma } = await import('@/lib/db');
    await prepareLinkedInOAuthConnect('user-1');
    expect(prisma.socialAccount.findMany).not.toHaveBeenCalled();
    expect(revokeMock).not.toHaveBeenCalled();
  });

  it('revokes only the reconnect target when reconnectAccountId is set', async () => {
    findFirstMock.mockResolvedValue({ accessToken: 'token-a' });
    await prepareLinkedInOAuthConnect('user-1', { reconnectAccountId: 'li-1' });
    expect(findFirstMock).toHaveBeenCalledWith({
      where: { userId: 'user-1', id: 'li-1', platform: 'LINKEDIN' },
      select: { accessToken: true },
    });
    expect(revokeMock).toHaveBeenCalledTimes(1);
    expect(revokeMock).toHaveBeenCalledWith('token-a');
  });
});
