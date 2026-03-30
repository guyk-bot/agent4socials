import { NextRequest, NextResponse } from 'next/server';
import { getPrismaUserIdFromRequest } from '@/lib/get-prisma-user';
import { prisma } from '@/lib/db';
import axios from 'axios';

const VIDEO_LIST_FIELDS = 'cover_image_url,id,title,create_time,share_url,like_count,comment_count,view_count';

/** All user.info fields we can request with user.info.basic + user.info.stats (see TikTok Login Kit / Display API). */
const USER_INFO_FIELDS_FULL =
  'open_id,union_id,avatar_url,avatar_large_url,display_name,bio_description,profile_deep_link,is_verified,follower_count,following_count,likes_count,video_count';

/**
 * GET /api/social/accounts/[id]/tiktok-debug
 * Raw TikTok Open API responses for this connection: user info (full field set), video list (first page), creator_info (posting).
 * Use to see exactly what we can show on the TikTok dashboard. No secrets — access token is never returned.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getPrismaUserIdFromRequest(request.headers.get('authorization'));
  if (!userId) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }
  const { id } = await params;
  const account = await prisma.socialAccount.findFirst({
    where: { id, userId, platform: 'TIKTOK' },
    select: { id: true, accessToken: true, username: true, platformUserId: true },
  });
  if (!account?.accessToken) {
    return NextResponse.json({ message: 'TikTok account not found or not connected' }, { status: 404 });
  }

  const token = account.accessToken;
  const headers = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };

  async function getUserInfo(fields: string) {
    try {
      const res = await axios.get('https://open.tiktokapis.com/v2/user/info/', {
        params: { fields },
        headers,
        timeout: 25_000,
        validateStatus: () => true,
      });
      return { fieldsRequested: fields, status: res.status, data: res.data as unknown };
    } catch (e) {
      const ax = e as { message?: string; response?: { status?: number; data?: unknown } };
      return {
        fieldsRequested: fields,
        status: ax.response?.status ?? 0,
        data: ax.response?.data ?? { error: ax.message ?? 'request failed' },
      };
    }
  }

  async function postVideoListFirstPage() {
    try {
      const res = await axios.post(
        `https://open.tiktokapis.com/v2/video/list/?fields=${encodeURIComponent(VIDEO_LIST_FIELDS)}`,
        { max_count: 20 },
        { headers, timeout: 30_000, validateStatus: () => true }
      );
      return { url: 'v2/video/list (first page)', status: res.status, data: res.data as unknown };
    } catch (e) {
      const ax = e as { message?: string; response?: { status?: number; data?: unknown } };
      return {
        url: 'v2/video/list (first page)',
        status: ax.response?.status ?? 0,
        data: ax.response?.data ?? { error: ax.message ?? 'request failed' },
      };
    }
  }

  async function postCreatorInfo() {
    try {
      const res = await axios.post(
        'https://open.tiktokapis.com/v2/post/publish/creator_info/query/',
        {},
        { headers, timeout: 15_000, validateStatus: () => true }
      );
      return { url: 'v2/post/publish/creator_info/query', status: res.status, data: res.data as unknown };
    } catch (e) {
      const ax = e as { message?: string; response?: { status?: number; data?: unknown } };
      return {
        url: 'v2/post/publish/creator_info/query',
        status: ax.response?.status ?? 0,
        data: ax.response?.data ?? { error: ax.message ?? 'request failed' },
      };
    }
  }

  const [userInfoFull, videoList, creatorInfo] = await Promise.all([
    getUserInfo(USER_INFO_FIELDS_FULL),
    postVideoListFirstPage(),
    postCreatorInfo(),
  ]);

  /** If full field set fails or returns no user, retry with the subset used in production insights. */
  let userInfoFallback: Awaited<ReturnType<typeof getUserInfo>> | null = null;
  const fullBody = userInfoFull.data as { error?: { code?: string }; data?: { user?: unknown } };
  const fullOk = !fullBody?.error?.code || fullBody.error.code === 'ok';
  if (!fullOk || fullBody?.data?.user == null) {
    userInfoFallback = await getUserInfo('open_id,follower_count,video_count,likes_count');
  }

  return NextResponse.json({
    _readme: {
      purpose: 'Raw TikTok Open API payloads for this account (same token as the app). Use to decide what to show on the TikTok dashboard.',
      oauthScopesWeRequest:
        'user.info.basic,user.info.stats,video.upload,video.publish,video.list',
      followersNote:
        'Exact follower_count comes from user.info with user.info.stats. If it is missing, reconnect and approve stats in TikTok Developer Portal.',
      dashboardNote:
        'We show followers from user.info; "Views" total is the sum of view_count from synced videos (Sync posts). TikTok does not expose full historical time-series like Meta.',
    },
    account: {
      id: account.id,
      username: account.username,
      platformUserId: account.platformUserId,
    },
    userInfo_fullFields: userInfoFull,
    userInfo_fallback_statsOnly: userInfoFallback,
    video_list_firstPage: videoList,
    post_publish_creator_info: creatorInfo,
  });
}
