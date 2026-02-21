/**
 * Verifies comment keyword reply automation for LinkedIn and X (Twitter):
 * correct API calls to fetch comments and post replies when keywords match.
 */
import axios from 'axios';
import { GET } from '../comment-automation/route';

jest.mock('axios');
jest.mock('@/lib/db', () => ({
  prisma: {
    post: { findMany: jest.fn() },
    commentAutomationReply: { findMany: jest.fn(), create: jest.fn() },
  },
}));

const prisma = require('@/lib/db').prisma;

const mockRequest = (secret: string) =>
  new Request('http://localhost/api/cron/comment-automation', {
    method: 'GET',
    headers: { 'X-Cron-Secret': secret },
  });

describe('comment-automation', () => {
  const CRON_SECRET = 'test-cron-secret';
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv, DATABASE_URL: 'postgres://x', CRON_SECRET };
    (prisma.commentAutomationReply.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.commentAutomationReply.create as jest.Mock).mockResolvedValue({});
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('returns 401 without valid X-Cron-Secret', async () => {
    (prisma.post.findMany as jest.Mock).mockResolvedValue([]);
    const res = await GET(mockRequest('wrong'));
    expect(res.status).toBe(401);
  });

  it('LinkedIn: fetches comments, matches keyword, posts reply with correct payload', async () => {
    const postId = 'post-1';
    const targetId = 'target-1';
    const platformPostId = 'urn:li:share:abc123';
    const platformUserId = 'person456';
    (prisma.post.findMany as jest.Mock).mockResolvedValue([
      {
        id: postId,
        commentAutomation: {
          keywords: ['demo'],
          replyTemplateByPlatform: { LINKEDIN: 'Thanks for your interest!' },
        },
        targets: [
          {
            id: targetId,
            platformPostId,
            status: 'POSTED',
            socialAccount: {
              id: 'acc-1',
              platform: 'LINKEDIN',
              accessToken: 'li-token',
              platformUserId,
            },
          },
        ],
      },
    ]);

    const linkedInComment = {
      id: 'comment-1',
      commentUrn: 'urn:li:comment:(share,comment-1)',
      object: 'share',
      message: { text: 'I want a demo' },
    };
    (axios.get as jest.Mock).mockResolvedValueOnce({
      data: { elements: [linkedInComment] },
    });

    const res = await GET(mockRequest(CRON_SECRET));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.results).toHaveLength(1);
    expect(body.results[0].platform).toBe('LINKEDIN');
    expect(body.results[0].replied).toBe(1);

    expect(axios.get).toHaveBeenCalledWith(
      expect.stringContaining('api.linkedin.com/rest/socialActions/'),
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer li-token' }) })
    );
    expect(axios.post).toHaveBeenCalledWith(
      expect.stringMatching(/api\.linkedin\.com\/rest\/socialActions\/.*\/comments/),
      expect.objectContaining({
        actor: 'urn:li:person:person456',
        message: { text: 'Thanks for your interest!' },
        parentComment: linkedInComment.commentUrn,
      }),
      expect.any(Object)
    );
    expect(prisma.commentAutomationReply.create).toHaveBeenCalledWith({
      data: { postTargetId: targetId, platformCommentId: linkedInComment.commentUrn },
    });
  });

  it('Twitter/X: fetches replies by conversation_id, matches keyword, posts reply (280 char limit)', async () => {
    const postId = 'post-2';
    const targetId = 'target-2';
    const platformPostId = '1234567890';
    (prisma.post.findMany as jest.Mock).mockResolvedValue([
      {
        id: postId,
        commentAutomation: {
          keywords: ['demo'],
          replyTemplateByPlatform: { TWITTER: 'Thanks! DM us for more.' },
        },
        targets: [
          {
            id: targetId,
            platformPostId,
            status: 'POSTED',
            socialAccount: {
              id: 'acc-2',
              platform: 'TWITTER',
              accessToken: 'tw-bearer',
              platformUserId: 'user-x',
            },
          },
        ],
      },
    ]);

    (axios.get as jest.Mock).mockResolvedValueOnce({
      data: {
        data: [
          { id: 'reply-tweet-1', text: 'I need a demo please' },
        ],
      },
    });

    const res = await GET(mockRequest(CRON_SECRET));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.results).toHaveLength(1);
    expect(body.results[0].platform).toBe('TWITTER');
    expect(body.results[0].replied).toBe(1);

    expect(axios.get).toHaveBeenCalledWith(
      'https://api.twitter.com/2/tweets/search/recent',
      expect.objectContaining({
        params: expect.objectContaining({
          query: `conversation_id:${platformPostId} is:reply`,
          max_results: 50,
        }),
        headers: { Authorization: 'Bearer tw-bearer' },
      })
    );
    expect(axios.post).toHaveBeenCalledWith(
      'https://api.twitter.com/2/tweets',
      expect.objectContaining({
        text: 'Thanks! DM us for more.',
        reply: { in_reply_to_tweet_id: 'reply-tweet-1' },
      }),
      expect.any(Object)
    );
    expect((axios.post as jest.Mock).mock.calls[0][1].text.length).toBeLessThanOrEqual(280);
    expect(prisma.commentAutomationReply.create).toHaveBeenCalledWith({
      data: { postTargetId: targetId, platformCommentId: 'reply-tweet-1' },
    });
  });
});
