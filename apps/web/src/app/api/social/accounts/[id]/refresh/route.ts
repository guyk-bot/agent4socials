import { NextRequest, NextResponse } from 'next/server';
import { getPrismaUserIdFromRequest } from '@/lib/get-prisma-user';
import { prisma } from '@/lib/db';
import axios from 'axios';
import { facebookGraphBaseUrl } from '@/lib/meta-graph-insights';
import { linkedInRestCommunityHeaders } from '@/lib/linkedin/rest-config';
import { resolveLinkedInAuthorUrn } from '@/lib/linkedin/rest-person';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ message: 'DATABASE_URL required' }, { status: 503 });
  }
  const userId = await getPrismaUserIdFromRequest(request.headers.get('authorization'));
  if (!userId) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }
  const { id } = await params;
  const account = await prisma.socialAccount.findFirst({
    where: { id, userId },
    select: { id: true, platform: true, accessToken: true, platformUserId: true, credentialsJson: true },
  });
  if (!account) {
    return NextResponse.json({ message: 'Account not found' }, { status: 404 });
  }
  if (
    account.platform !== 'INSTAGRAM' &&
    account.platform !== 'FACEBOOK' &&
    account.platform !== 'TWITTER' &&
    account.platform !== 'TIKTOK' &&
    account.platform !== 'YOUTUBE' &&
    account.platform !== 'PINTEREST' &&
    account.platform !== 'LINKEDIN'
  ) {
    return NextResponse.json({ message: 'Refresh supported for Instagram, Facebook, Twitter, TikTok, YouTube, LinkedIn, and Pinterest only' }, { status: 400 });
  }
  const token = account.accessToken;
  let username: string | undefined;
  let profilePicture: string | undefined;
  let platformUserId: string | undefined;

  try {
    if (account.platform === 'FACEBOOK') {
      const isPlaceholderId = account.platformUserId.startsWith('fb-');
      let pages: Array<{ id: string; name?: string; picture?: { data?: { url?: string } }; access_token?: string }> = [];
      const hydrateFacebookPageById = async (pageId: string, tokenToUse: string) => {
        try {
          const pageRes = await axios.get<{ name?: string; picture?: { data?: { url?: string } } }>(
            `${facebookGraphBaseUrl}/${pageId}`,
            { params: { fields: 'name,picture.type(large)', access_token: tokenToUse } }
          );
          if (pageRes.data?.name) username = pageRes.data.name;
          if (pageRes.data?.picture?.data?.url) profilePicture = pageRes.data.picture.data.url;
        } catch (_) {
          // keep existing values on Graph fetch errors
        }
        // Last-resort deterministic URL. Works for many page/profile ids even when Graph fields fail.
        if (!profilePicture) {
          profilePicture = `${facebookGraphBaseUrl}/${encodeURIComponent(pageId)}/picture?type=large`;
        }
      };
      try {
        const pagesRes = await axios.get<{ data?: typeof pages; error?: { message?: string; code?: number } }>(
          `${facebookGraphBaseUrl}/me/accounts`,
          { params: { fields: 'id,name,picture,access_token', access_token: token } }
        );
        pages = pagesRes.data?.data || [];
        if (pagesRes.data?.error) {
          console.warn('[Social accounts] Facebook me/accounts API error:', pagesRes.data.error);
        }
      } catch (meErr: unknown) {
        const err = meErr as { response?: { data?: unknown; status?: number } };
        const fbMsg = JSON.stringify(err.response?.data ?? (meErr as Error)?.message ?? '');
        const unsupportedAccountsField =
          fbMsg.includes('Tried accessing nonexisting field (accounts)') ||
          fbMsg.includes('"code":100');
        if (unsupportedAccountsField) {
          // Some tokens (page-scoped) cannot call /me/accounts.
          // Fall back to the currently connected page id and still refresh avatar/name.
          if (!isPlaceholderId) {
            platformUserId = account.platformUserId;
            await hydrateFacebookPageById(account.platformUserId, token);
            const data: { username?: string; profilePicture?: string; platformUserId?: string } = {};
            if (username) data.username = username;
            if (profilePicture !== undefined) data.profilePicture = profilePicture;
            if (platformUserId) data.platformUserId = platformUserId;
            if (Object.keys(data).length > 0) {
              await prisma.socialAccount.update({
                where: { id: account.id },
                data,
              });
            }
          }
          return NextResponse.json({ ok: true, warning: 'Facebook token cannot query /me/accounts for this connection.' });
        }
        console.warn('[Social accounts] Facebook me/accounts request failed:', err.response?.status, err.response?.data ?? (meErr as Error)?.message);
        return NextResponse.json(
          { message: 'Facebook returned an error when loading your Pages. Disconnect and reconnect Facebook, and when asked grant "Manage your business and its assets" (business_management) so we can see your Page.' },
          { status: 502 }
        );
      }
      if (pages.length === 0) {
        if (!isPlaceholderId) {
          platformUserId = account.platformUserId;
          await hydrateFacebookPageById(account.platformUserId, token);
        } else {
          console.warn('[Social accounts] Facebook me/accounts returned no pages and account has placeholder id.');
          return NextResponse.json(
            { message: 'Facebook returned no Pages. Reconnect Facebook and when asked, allow "Manage your business and its assets" so we can load your Page name and picture.' },
            { status: 400 }
          );
        }
      }
      const page = isPlaceholderId ? pages[0] : (pages.find((p) => p.id === account.platformUserId) ?? pages[0]);
      if (page?.id) {
        platformUserId = page.id;
        username = page.name ?? undefined;
        profilePicture = page.picture?.data?.url ?? undefined;
        const tokenToUse = page.access_token || token;
        if (!profilePicture || !username) {
          try {
            const pageRes = await axios.get<{ name?: string; picture?: { data?: { url?: string } } }>(
              `${facebookGraphBaseUrl}/${page.id}`,
              { params: { fields: 'name,picture', access_token: tokenToUse } }
            );
            if (pageRes.data?.name) username = pageRes.data.name;
            if (pageRes.data?.picture?.data?.url) profilePicture = pageRes.data.picture.data.url;
          } catch (_) {}
        }
        if (!profilePicture && tokenToUse) {
          try {
            const pageRes = await axios.get<{ picture?: { data?: { url?: string } } }>(
              `${facebookGraphBaseUrl}/${page.id}`,
              { params: { fields: 'picture.type(large)', access_token: tokenToUse } }
            );
            if (pageRes.data?.picture?.data?.url) profilePicture = pageRes.data.picture.data.url;
          } catch (_) {}
        }
      }
    } else if (account.platform === 'INSTAGRAM') {
      const isOldFormat = account.platformUserId.startsWith('instagram-');
      if (isOldFormat) {
      const pagesRes = await axios.get<{ data?: Array<{ id: string; instagram_business_account?: { id: string } }> }>(
        `${facebookGraphBaseUrl}/me/accounts`,
        { params: { fields: 'id,instagram_business_account', access_token: token } }
      );
      const pages = pagesRes.data?.data || [];
      for (const page of pages) {
        const igId = page.instagram_business_account?.id;
        if (!igId) continue;
        const igRes = await axios.get<{ username?: string; profile_picture_url?: string }>(
          `${facebookGraphBaseUrl}/${igId}`,
          { params: { fields: 'username,profile_picture_url', access_token: token } }
        );
        // save real id and profile even when username is missing
        platformUserId = igId;
        username = igRes.data?.username ?? 'Instagram';
        profilePicture = igRes.data?.profile_picture_url ?? undefined;
        break;
      }
      } else {
        try {
          const igRes = await axios.get<{ username?: string; profile_picture_url?: string }>(
            'https://graph.instagram.com/me',
            { params: { fields: 'username,profile_picture_url', access_token: token } }
          );
          username = igRes.data?.username ?? undefined;
          profilePicture = igRes.data?.profile_picture_url ?? undefined;
        } catch (_) {
          const igRes = await axios.get<{ username?: string; profile_picture_url?: string }>(
            `${facebookGraphBaseUrl}/${account.platformUserId}`,
            { params: { fields: 'username,profile_picture_url', access_token: token } }
          );
          username = igRes.data?.username ?? undefined;
          profilePicture = igRes.data?.profile_picture_url ?? undefined;
        }
      }
    } else if (account.platform === 'TWITTER') {
      try {
        const meRes = await axios.get<{ data?: { id?: string; username?: string; name?: string; profile_image_url?: string } }>(
          'https://api.twitter.com/2/users/me',
          {
            params: { 'user.fields': 'username,name,profile_image_url' },
            headers: { Authorization: `Bearer ${token}` },
          }
        );
        const u = meRes.data?.data;
        if (u?.id) platformUserId = u.id;
        if (u?.username) username = u.username;
        else if (u?.name) username = u.name;
        if (u?.profile_image_url) profilePicture = u.profile_image_url.replace(/_normal\./, '_400x400.');
      } catch (_) {}
    } else if (account.platform === 'TIKTOK') {
      const { fetchTikTokProfile } = await import('@/lib/tiktok/fetch-profile');
      const tiktokProfile = await fetchTikTokProfile(token, { socialAccountId: account.id });
      if (tiktokProfile.username) username = tiktokProfile.username;
      if (tiktokProfile.profilePicture) profilePicture = tiktokProfile.profilePicture;
    } else if (account.platform === 'YOUTUBE') {
      try {
        const chRes = await axios.get<{
          items?: Array<{
            id?: string;
            snippet?: { title?: string; customUrl?: string; thumbnails?: { default?: { url?: string }; medium?: { url?: string } } };
          }>;
        }>('https://www.googleapis.com/youtube/v3/channels', {
          params: { part: 'snippet', mine: 'true' },
          headers: { Authorization: `Bearer ${token}` },
        });
        const ch = chRes.data?.items?.[0];
        if (ch?.id) platformUserId = ch.id;
        if (ch?.snippet?.title) username = ch.snippet.title;
        profilePicture = ch?.snippet?.thumbnails?.medium?.url ?? ch?.snippet?.thumbnails?.default?.url ?? undefined;
      } catch (_) {}
    } else if (account.platform === 'PINTEREST') {
      try {
        const ua = await axios.get<{ username?: string; business_name?: string; profile_image?: string }>(
          'https://api.pinterest.com/v5/user_account',
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (ua.data?.business_name) username = ua.data.business_name;
        else if (ua.data?.username) username = ua.data.username;
        if (ua.data?.profile_image) profilePicture = ua.data.profile_image;
      } catch (_) {}
    } else if (account.platform === 'LINKEDIN') {
      try {
        const userRes = await axios.get<{ sub?: string; name?: string; picture?: string }>(
          'https://api.linkedin.com/v2/userinfo',
          { headers: linkedInRestCommunityHeaders(token) }
        );
        if (userRes.data?.sub) platformUserId = userRes.data.sub;
        if (userRes.data?.name) username = userRes.data.name;
        if (userRes.data?.picture) profilePicture = userRes.data.picture;
      } catch (_) {}
      const resolved = await resolveLinkedInAuthorUrn(token, {
        platformUserId: platformUserId ?? account.platformUserId,
        credentialsJson: account.credentialsJson,
      });
      if (resolved.personUrn) {
        const prev =
          account.credentialsJson && typeof account.credentialsJson === 'object' && account.credentialsJson !== null
            ? { ...(account.credentialsJson as Record<string, unknown>) }
            : {};
        await prisma.socialAccount.update({
          where: { id: account.id },
          data: {
            credentialsJson: { ...prev, linkedinRestPersonUrn: resolved.personUrn },
          },
        });
      }
    }
    const data: { username?: string; profilePicture?: string; platformUserId?: string } = {};
    if (username) data.username = username;
    if (profilePicture !== undefined) data.profilePicture = profilePicture;
    if (platformUserId) data.platformUserId = platformUserId;
    if (Object.keys(data).length > 0) {
      await prisma.socialAccount.update({
        where: { id: account.id },
        data,
      });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('[Social accounts] Refresh error:', e);
    return NextResponse.json({ message: 'Failed to refresh profile' }, { status: 500 });
  }
}
