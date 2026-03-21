import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { Platform } from '@prisma/client';
import axios from 'axios';
import { ensureBootstrapSnapshotForToday } from '@/lib/analytics/metric-snapshots';
const PLATFORMS = ['INSTAGRAM', 'TIKTOK', 'YOUTUBE', 'FACEBOOK', 'TWITTER', 'LINKEDIN', 'PINTEREST'] as const;

const OAUTH_HEAD = '<meta charset="utf-8"><meta name="robots" content="noindex, nofollow">';

function oauthErrorHtml(baseUrl: string, message: string, status: number): NextResponse {
  const dashboardUrl = `${baseUrl.replace(/\/+$/, '')}/dashboard`;
  const html = `<!DOCTYPE html><html><head>${OAUTH_HEAD}<title>Agent4Socials – Connection failed</title></head><body style="font-family:system-ui;max-width:480px;margin:2rem auto;padding:1rem;">
<h2 style="color:#b91c1c;">Connection failed</h2>
<p>${message.replace(/</g, '&lt;')}</p>
<p><a href="${dashboardUrl}">Back to Dashboard</a></p>
<script>
if (window.opener) { try { window.close(); } catch (e) {} }
</script>
</body></html>`;
  return new NextResponse(html, { status, headers: { 'Content-Type': 'text/html' } });
}

type TokenResult = {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: Date;
  platformUserId: string;
  username: string;
  profilePicture?: string | null;
  /** OAuth 2.0 scopes actually granted by X (captured at token exchange time) */
  twitterGrantedScope?: string;
  /** When multiple Facebook Pages, list for user to pick one (access_token is the Page token) */
  pages?: Array<{ id: string; name?: string; picture?: string; instagram_business_account_id?: string; access_token?: string }>;
  /** When multiple Instagram Business accounts (via Facebook), list for user to pick one */
  instagramAccounts?: Array<{ id: string; username?: string; profilePicture?: string; pageId?: string; pageName?: string; pagePicture?: string; pageAccessToken?: string }>;
  /** When connecting Instagram via Facebook: the linked Page to also create as FACEBOOK */
  linkedPage?: { id: string; name: string; picture: string | null };
  /** When connecting Facebook: the linked Instagram Business account to also create as INSTAGRAM */
  linkedInstagram?: { id: string; username?: string; profilePicture?: string };
  /** Pinterest: default board for publishing (first board from /v5/boards when available) */
  pinterestCredentials?: {
    defaultBoardId: string | null;
    boards?: Array<{ id: string; name?: string }>;
  };
};

async function exchangeCodeInstagramLogin(code: string, callbackUrl: string): Promise<TokenResult> {
  const clientId = process.env.INSTAGRAM_APP_ID || process.env.META_APP_ID;
  const clientSecret = process.env.INSTAGRAM_APP_SECRET || process.env.META_APP_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error('INSTAGRAM_APP_ID and INSTAGRAM_APP_SECRET (or META_APP_*) must be set');
  }
  const r = await axios.post(
    'https://api.instagram.com/oauth/access_token',
    new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'authorization_code',
      redirect_uri: callbackUrl,
      code,
    }).toString(),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, validateStatus: () => true }
  );
  const body = r.data;
  if (body?.error_type || body?.error_message) {
    const msg = body.error_message || body.error_type || 'Instagram token error';
    console.error('[Social OAuth] Instagram token error:', body);
    throw new Error(msg);
  }
  const data = body?.data?.[0] ?? body;
  const accessToken = data?.access_token;
  const rawUserId = data?.user_id;
  if (!accessToken || rawUserId === undefined) {
    console.error('[Social OAuth] Instagram token response missing access_token or user_id:', body);
    throw new Error('Instagram did not return an access token. Try again or use Connect with Facebook.');
  }
  const platformUserId = String(rawUserId);
  let username = 'Instagram';
  let profilePicture: string | null = null;
  try {
    const meRes = await axios.get<{ username?: string; profile_picture_url?: string }>(
      'https://graph.instagram.com/me',
      {
        params: {
          fields: 'username,profile_picture_url',
          access_token: accessToken,
        },
      }
    );
    if (meRes.data?.username) username = meRes.data.username;
    if (meRes.data?.profile_picture_url) profilePicture = meRes.data.profile_picture_url;
  } catch (_) {
    // use defaults
  }
  let finalToken = accessToken;
  let expiresIn = 3600;
  try {
    const longLived = await axios.get<{ access_token?: string; expires_in?: number }>(
      'https://graph.instagram.com/access_token',
      {
        params: {
          grant_type: 'ig_exchange_token',
          client_secret: clientSecret,
          access_token: accessToken,
        },
      }
    );
    if (longLived.data?.access_token) {
      finalToken = longLived.data.access_token;
      expiresIn = longLived.data.expires_in ?? 5183944;
    }
  } catch (_) {
    // store short-lived
  }
  return {
    accessToken: finalToken,
    refreshToken: null,
    expiresAt: new Date(Date.now() + expiresIn * 1000),
    platformUserId,
    username,
    profilePicture,
  };
}

async function exchangeCode(
  platform: Platform,
  code: string,
  callbackUrl: string
): Promise<TokenResult> {
  switch (platform) {
    case 'INSTAGRAM': {
      const r = await axios.get('https://graph.facebook.com/v18.0/oauth/access_token', {
        params: {
          client_id: process.env.META_APP_ID,
          client_secret: process.env.META_APP_SECRET,
          redirect_uri: callbackUrl,
          code,
        },
      });
      const accessToken = r.data.access_token;
      let username = 'Instagram';
      let profilePicture: string | null = null;
      let platformUserId = 'instagram-' + (accessToken?.slice(-8) || 'id');
      const instagramAccounts: Array<{ id: string; username?: string; profilePicture?: string; pageId?: string; pageName?: string; pagePicture?: string; pageAccessToken?: string }> = [];
      let linkedPage: { id: string; name: string; picture: string | null } | undefined;
      try {
        const pagesRes = await axios.get<{
          data?: Array<{
            id: string;
            name?: string;
            picture?: { data?: { url?: string } };
            access_token?: string;
            instagram_business_account?: { id: string };
          }>;
        }>(
          'https://graph.facebook.com/v18.0/me/accounts',
          { params: { fields: 'id,name,picture,access_token,instagram_business_account', access_token: accessToken } }
        );
        const pages = pagesRes.data?.data || [];
        for (const page of pages) {
          const igAccountId = page.instagram_business_account?.id;
          if (!igAccountId) continue;
          const pagePicture = page.picture?.data?.url ?? undefined;
          const pageName = page.name ?? 'Facebook Page';
          let igUsername: string | undefined;
          let igPicture: string | undefined;
          try {
            const igRes = await axios.get<{ username?: string; profile_picture_url?: string }>(
              `https://graph.facebook.com/v18.0/${igAccountId}`,
              { params: { fields: 'username,profile_picture_url', access_token: accessToken } }
            );
            igUsername = igRes.data?.username;
            igPicture = igRes.data?.profile_picture_url;
          } catch {
            // still add account with id so user can choose
          }
          instagramAccounts.push({
            id: igAccountId,
            username: igUsername,
            profilePicture: igPicture,
            pageId: page.id,
            pageName,
            pagePicture,
            pageAccessToken: page.access_token,
          });
          // use first account for single-account path; save real id and picture even if username missing
          if (instagramAccounts.length === 1) {
            platformUserId = igAccountId;
            username = igUsername ?? 'Instagram';
            profilePicture = igPicture ?? null;
            linkedPage = { id: page.id, name: pageName, picture: pagePicture ?? null };
          }
        }
      } catch (e) {
        console.error('[Social OAuth] Instagram (Facebook) me/accounts or profile fetch:', (e as Error)?.message ?? e);
      }
      const result: TokenResult = {
        accessToken,
        refreshToken: null,
        expiresAt: new Date(Date.now() + (r.data.expires_in || 3600) * 1000),
        platformUserId,
        username,
        profilePicture,
      };
      if (linkedPage) result.linkedPage = linkedPage;
      if (instagramAccounts.length >= 1) {
        result.instagramAccounts = instagramAccounts;
      }
      return result;
    }
    case 'TIKTOK': {
      // TikTok OAuth v2: endpoint, redirect_uri in body, and top-level response (no .data wrapper)
      const tiktokRedirect = (process.env.TIKTOK_REDIRECT_URI || callbackUrl).replace(/\/+$/, '');
      const r = await axios.post<{
        access_token?: string;
        open_id?: string;
        refresh_token?: string;
        expires_in?: number;
        error?: string;
        error_description?: string;
      }>(
        'https://open.tiktokapis.com/v2/oauth/token/',
        new URLSearchParams({
          client_key: process.env.TIKTOK_CLIENT_KEY || '',
          client_secret: process.env.TIKTOK_CLIENT_SECRET || '',
          code,
          grant_type: 'authorization_code',
          redirect_uri: tiktokRedirect,
        }).toString(),
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
      );
      const data = r.data;
      if (data?.error || !data?.access_token) {
        const msg = data?.error_description || data?.error || 'TikTok did not return an access token';
        console.warn('[Social OAuth] TikTok token error:', msg);
        throw new Error(msg);
      }
      let username = 'TikTok User';
      let profilePicture: string | null = null;
      try {
        const userRes = await axios.get<{
          data?: { user?: { display_name?: string; avatar_url?: string; avatar_large_url?: string } };
          error?: { code?: string };
        }>('https://open.tiktokapis.com/v2/user/info/', {
          params: { fields: 'open_id,display_name,avatar_url,avatar_large_url' },
          headers: {
            Authorization: `Bearer ${data.access_token}`,
            'Content-Type': 'application/json',
          },
        });
        const user = userRes.data?.data?.user;
        if (userRes.data?.error?.code !== 'ok' && userRes.data?.error?.code) {
          // non-ok error, skip profile
        } else if (user) {
          if (user.display_name) username = user.display_name;
          profilePicture = user.avatar_large_url || user.avatar_url || null;
        }
      } catch (e) {
        console.warn('[Social OAuth] TikTok user/info:', (e as Error)?.message ?? e);
      }
      return {
        accessToken: data.access_token,
        refreshToken: data.refresh_token ?? null,
        expiresAt: new Date(Date.now() + (data.expires_in || 86400) * 1000),
        platformUserId: data.open_id || 'tiktok-id',
        username,
        profilePicture,
      };
    }
    case 'YOUTUBE': {
      const r = await axios.post('https://oauth2.googleapis.com/token', new URLSearchParams({
        client_id: process.env.YOUTUBE_CLIENT_ID!,
        client_secret: process.env.YOUTUBE_CLIENT_SECRET!,
        code,
        redirect_uri: callbackUrl,
        grant_type: 'authorization_code',
      }), { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
      const accessToken = r.data.access_token;
      let platformUserId = 'youtube-' + (accessToken?.slice(-8) || 'id');
      let username = 'YouTube Channel';
      let profilePicture: string | null = null;
      try {
        const chRes = await axios.get<{
          items?: Array<{
            id: string;
            snippet?: { title?: string; thumbnails?: { default?: { url?: string }; medium?: { url?: string } } };
            statistics?: { subscriberCount?: string; viewCount?: string; videoCount?: string };
          }>;
        }>('https://www.googleapis.com/youtube/v3/channels', {
          params: { part: 'snippet,statistics', mine: 'true' },
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        const channel = chRes.data?.items?.[0];
        if (channel?.id) {
          platformUserId = channel.id;
          if (channel.snippet?.title) username = channel.snippet.title;
          const thumb = channel.snippet?.thumbnails?.medium?.url ?? channel.snippet?.thumbnails?.default?.url;
          if (thumb) profilePicture = thumb;
        }
      } catch (e) {
        console.warn('[Social OAuth] YouTube channels.list:', (e as Error)?.message ?? e);
      }
      return {
        accessToken,
        refreshToken: r.data.refresh_token ?? null,
        expiresAt: new Date(Date.now() + (r.data.expires_in || 3600) * 1000),
        platformUserId,
        username,
        profilePicture,
      };
    }
    case 'FACEBOOK': {
      const r = await axios.get('https://graph.facebook.com/v18.0/oauth/access_token', {
        params: {
          client_id: process.env.META_APP_ID,
          client_secret: process.env.META_APP_SECRET,
          redirect_uri: callbackUrl,
          code,
        },
      });
      const accessToken = r.data.access_token;
      let username = 'Facebook Page';
      let profilePicture: string | null = null;
      let pageId: string | null = null;
      let linkedInstagram: { id: string; username?: string; profilePicture?: string } | undefined;
      const pagesForSelect: Array<{ id: string; name?: string; picture?: string; instagram_business_account_id?: string; access_token?: string }> = [];
      try {
        const pagesRes = await axios.get<{
          data?: Array<{
            id: string;
            name?: string;
            picture?: { data?: { url?: string } };
            access_token?: string;
            instagram_business_account?: { id: string };
          }>;
          error?: { message?: string };
        }>(
          'https://graph.facebook.com/v18.0/me/accounts',
          { params: { fields: 'id,name,picture,access_token,instagram_business_account', access_token: accessToken } }
        );
        const pages = pagesRes.data?.data || [];
        if (pagesRes.data?.error) {
          console.warn('[Social OAuth] Facebook me/accounts API error:', pagesRes.data.error);
        }
        if (pages.length === 0) {
          console.warn('[Social OAuth] Facebook me/accounts returned no pages. User must grant business_management when connecting.');
        }
        for (const p of pages) {
          const picUrl = p.picture?.data?.url;
          const igId = p.instagram_business_account?.id;
          if (p?.id) pagesForSelect.push({ id: p.id, name: p.name ?? undefined, picture: picUrl, instagram_business_account_id: igId, access_token: p.access_token });
        }
        const page = pages[0];
        if (page?.id) {
          pageId = page.id;
          username = page.name ?? 'Facebook Page';
          profilePicture = page.picture?.data?.url ?? null;
          if (!profilePicture || !page.name) {
            const tokenToUse = page.access_token || accessToken;
            try {
              const pageRes = await axios.get<{ name?: string; picture?: { data?: { url?: string } } }>(
                `https://graph.facebook.com/v18.0/${page.id}`,
                { params: { fields: 'name,picture', access_token: tokenToUse } }
              );
              if (pageRes.data?.name) username = pageRes.data.name;
              if (pageRes.data?.picture?.data?.url) profilePicture = pageRes.data.picture.data.url;
            } catch (_) {}
          }
          const igAccountId = page.instagram_business_account?.id;
          if (igAccountId) {
            try {
              const igRes = await axios.get<{ username?: string; profile_picture_url?: string }>(
                `https://graph.facebook.com/v18.0/${igAccountId}`,
                { params: { fields: 'username,profile_picture_url', access_token: accessToken } }
              );
              linkedInstagram = {
                id: igAccountId,
                username: igRes.data?.username,
                profilePicture: igRes.data?.profile_picture_url,
              };
            } catch (_) {}
          }
        }
      } catch (e) {
        console.warn('[Social OAuth] Facebook me/accounts request failed:', (e as { response?: { data?: unknown } })?.response?.data ?? (e as Error)?.message);
        // keep defaults (placeholder id, "Facebook Page", null picture)
      }
      return {
        accessToken,
        refreshToken: null,
        expiresAt: new Date(Date.now() + (r.data.expires_in || 3600) * 1000),
        platformUserId: pageId || 'fb-' + (accessToken?.slice(-8) || 'id'),
        username,
        profilePicture,
        pages: pagesForSelect.length > 0 ? pagesForSelect : undefined,
        linkedInstagram,
      };
    }
    case 'TWITTER': {
      const r = await axios.post('https://api.twitter.com/2/oauth2/token', new URLSearchParams({
        code,
        grant_type: 'authorization_code',
        redirect_uri: callbackUrl,
        code_verifier: 'challenge',
      }).toString(), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        auth: {
          username: process.env.TWITTER_CLIENT_ID || '',
          password: process.env.TWITTER_CLIENT_SECRET || '',
        },
      });
      const accessToken = r.data.access_token;
      const grantedScope: string = typeof r.data.scope === 'string' ? r.data.scope : (Array.isArray(r.data.scope) ? r.data.scope.join(' ') : '');
      console.log('[Twitter OAuth2] granted scope:', grantedScope || '(none returned)');
      let username = 'X User';
      let profilePicture: string | null = null;
      let platformUserId = 'twitter-' + (accessToken?.slice(-8) || 'id');
      try {
        const meRes = await axios.get<{ data?: { id?: string; username?: string; name?: string; profile_image_url?: string } }>(
          'https://api.twitter.com/2/users/me',
          {
            params: { 'user.fields': 'username,name,profile_image_url' },
            headers: { Authorization: `Bearer ${accessToken}` },
          }
        );
        const u = meRes.data?.data;
        if (u?.id) platformUserId = u.id;
        if (u?.username) username = u.username;
        else if (u?.name) username = u.name;
        if (u?.profile_image_url) profilePicture = u.profile_image_url.replace(/_normal\./, '_400x400.');
      } catch (_) {}
      return {
        accessToken,
        refreshToken: r.data.refresh_token ?? null,
        expiresAt: new Date(Date.now() + (r.data.expires_in || 7200) * 1000),
        platformUserId,
        username,
        profilePicture,
        twitterGrantedScope: grantedScope || undefined,
      };
    }
    case 'LINKEDIN': {
      const r = await axios.post('https://www.linkedin.com/oauth/v2/accessToken', new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: callbackUrl,
        client_id: process.env.LINKEDIN_CLIENT_ID!,
        client_secret: process.env.LINKEDIN_CLIENT_SECRET!,
      }).toString(), { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
      const accessToken = r.data.access_token;
      let platformUserId = 'li-' + (accessToken?.slice(-8) || 'id');
      let username = 'LinkedIn';
      let profilePicture: string | null = null;
      try {
        const userRes = await axios.get<{ sub?: string; name?: string; picture?: string }>(
          'https://api.linkedin.com/v2/userinfo',
          { headers: { Authorization: `Bearer ${accessToken}` } }
        );
        if (userRes.data?.sub) platformUserId = userRes.data.sub;
        if (userRes.data?.name) username = userRes.data.name;
        if (userRes.data?.picture) profilePicture = userRes.data.picture;
      } catch (_) {
        // keep defaults if userinfo fails
      }
      return {
        accessToken,
        refreshToken: null,
        expiresAt: new Date(Date.now() + (r.data.expires_in || 3600) * 1000),
        platformUserId,
        username,
        profilePicture,
      };
    }
    case 'PINTEREST': {
      const clientId = process.env.PINTEREST_APP_ID || process.env.PINTEREST_CLIENT_ID;
      const clientSecret = process.env.PINTEREST_APP_SECRET || process.env.PINTEREST_CLIENT_SECRET;
      if (!clientId || !clientSecret) {
        throw new Error('PINTEREST_APP_ID and PINTEREST_APP_SECRET must be set');
      }
      const pinRedirect = (process.env.PINTEREST_REDIRECT_URI || callbackUrl).replace(/\/+$/, '');
      const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
      const r = await axios.post<{
        access_token?: string;
        refresh_token?: string;
        expires_in?: number;
        code?: number;
        message?: string;
      }>(
        'https://api.pinterest.com/v5/oauth/token',
        new URLSearchParams({
          grant_type: 'authorization_code',
          code,
          redirect_uri: pinRedirect,
        }).toString(),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Authorization: `Basic ${basic}`,
          },
          validateStatus: () => true,
        }
      );
      if (r.status !== 200 || !r.data?.access_token) {
        const msg =
          typeof r.data?.message === 'string'
            ? r.data.message
            : `Pinterest token error (HTTP ${r.status})`;
        console.error('[Social OAuth] Pinterest token:', r.status, r.data);
        throw new Error(msg);
      }
      const accessToken = r.data.access_token;
      let platformUserId = 'pin-' + accessToken.slice(-8);
      let username = 'Pinterest';
      let profilePicture: string | null = null;
      const pinterestCredentials: {
        defaultBoardId: string | null;
        boards?: Array<{ id: string; name?: string }>;
      } = { defaultBoardId: null };
      try {
        const ua = await axios.get<{
          username?: string;
          id?: string;
          profile_image?: string;
        }>('https://api.pinterest.com/v5/user_account', {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (ua.data?.id) platformUserId = ua.data.id;
        if (ua.data?.username) username = ua.data.username;
        if (ua.data?.profile_image) profilePicture = ua.data.profile_image;
      } catch (e) {
        console.warn('[Social OAuth] Pinterest user_account:', (e as Error)?.message ?? e);
      }
      try {
        const boardsRes = await axios.get<{
          items?: Array<{ id?: string; name?: string }>;
        }>('https://api.pinterest.com/v5/boards', {
          headers: { Authorization: `Bearer ${accessToken}` },
          params: { page_size: 25 },
        });
        const items = boardsRes.data?.items ?? [];
        const boards = items.filter((b) => b?.id).map((b) => ({ id: b.id as string, name: b.name }));
        pinterestCredentials.boards = boards;
        if (boards[0]?.id) pinterestCredentials.defaultBoardId = boards[0].id;
      } catch (e) {
        console.warn('[Social OAuth] Pinterest boards:', (e as Error)?.message ?? e);
      }
      const expiresIn = r.data.expires_in ?? 3600;
      return {
        accessToken,
        refreshToken: r.data.refresh_token ?? null,
        expiresAt: new Date(Date.now() + expiresIn * 1000),
        platformUserId,
        username,
        profilePicture,
        pinterestCredentials,
      };
    }
    default:
      throw new Error('Unsupported platform');
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ platform: string }> }
) {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ error: 'Social OAuth requires DATABASE_URL' }, { status: 503 });
  }
  const { platform } = await params;
  const plat = platform?.toUpperCase() as Platform;
  if (!plat || !PLATFORMS.includes(plat)) {
    return NextResponse.json({ error: 'Invalid platform' }, { status: 400 });
  }

  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const stateRaw = searchParams.get('state'); // Prisma userId or "userId:instagram"

  const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL || 'https://agent4socials.com').replace(/\/+$/, '');
  const dashboardUrl = `${baseUrl}/dashboard`;

  // User clicked "Not now" or denied permission: redirect to dashboard instead of showing an error
  const oauthError = searchParams.get('error');
  if (!code && (oauthError === 'access_denied' || oauthError === 'user_denied' || searchParams.has('error'))) {
    return NextResponse.redirect(dashboardUrl);
  }

  if (!code || !stateRaw) {
    return NextResponse.json({ error: 'Missing code or state' }, { status: 400 });
  }

  const isInstagramLogin = stateRaw.includes(':instagram');
  const isLinkedInPage = stateRaw.includes(':linkedin_page');
  const userId = isInstagramLogin ? stateRaw.replace(/:instagram$/, '') : isLinkedInPage ? stateRaw.replace(/:linkedin_page$/, '') : stateRaw;
  const defaultCallbackUrl = `${baseUrl}/api/social/oauth/${platform}/callback`;
  let callbackUrl = defaultCallbackUrl;
  if (plat === 'INSTAGRAM' && isInstagramLogin && process.env.INSTAGRAM_REDIRECT_URI) {
    callbackUrl = process.env.INSTAGRAM_REDIRECT_URI.replace(/\/+$/, '');
  } else if (plat === 'FACEBOOK' && process.env.FACEBOOK_REDIRECT_URI) {
    callbackUrl = process.env.FACEBOOK_REDIRECT_URI.replace(/\/+$/, '');
  } else if (plat === 'YOUTUBE' && process.env.YOUTUBE_REDIRECT_URI) {
    callbackUrl = process.env.YOUTUBE_REDIRECT_URI.replace(/\/+$/, '');
  } else if (plat === 'TIKTOK' && process.env.TIKTOK_REDIRECT_URI) {
    callbackUrl = process.env.TIKTOK_REDIRECT_URI.replace(/\/+$/, '');
  } else if (plat === 'TWITTER' && process.env.TWITTER_REDIRECT_URI) {
    callbackUrl = process.env.TWITTER_REDIRECT_URI.replace(/\/+$/, '');
  } else if (plat === 'PINTEREST' && process.env.PINTEREST_REDIRECT_URI) {
    callbackUrl = process.env.PINTEREST_REDIRECT_URI.replace(/\/+$/, '');
  }

  let tokenData: TokenResult;
  try {
    if (plat === 'INSTAGRAM' && isInstagramLogin) {
      tokenData = await exchangeCodeInstagramLogin(code, callbackUrl);
    } else {
      tokenData = await exchangeCode(plat, code, callbackUrl);
    }
  } catch (e) {
    const err = e as Error;
    console.error('[Social OAuth] exchange error:', err?.message ?? e, err);
    const message = err?.message?.includes('Instagram') ? err.message : 'Failed to connect account';
    return oauthErrorHtml(baseUrl, message, 500);
  }

  if (plat === 'LINKEDIN' && isLinkedInPage && tokenData.accessToken) {
    try {
      const aclRes = await axios.get<{ elements?: Array<{ organization?: string }> }>(
        'https://api.linkedin.com/rest/organizationAcls?q=roleAssignee&role=ADMINISTRATOR',
        {
          headers: {
            Authorization: `Bearer ${tokenData.accessToken}`,
            'X-Restli-Protocol-Version': '2.0.0',
          },
        }
      );
      const orgUrn = aclRes.data?.elements?.[0]?.organization;
      if (orgUrn && typeof orgUrn === 'string') {
        const orgId = orgUrn.replace(/^urn:li:organization:/i, '') || orgUrn;
        tokenData.platformUserId = orgUrn;
        tokenData.username = 'LinkedIn Page';
        try {
          const orgRes = await axios.get<{
            localizedName?: string;
            name?: { localized?: Record<string, string> };
          }>(
            `https://api.linkedin.com/rest/organizations/${encodeURIComponent(orgId)}`,
            {
              headers: {
                Authorization: `Bearer ${tokenData.accessToken}`,
                'X-Restli-Protocol-Version': '2.0.0',
              },
            }
          );
          const name =
            orgRes.data?.localizedName ??
            (orgRes.data?.name?.localized && Object.values(orgRes.data.name.localized)[0]);
          if (name) tokenData.username = name;
        } catch (_) {}
      }
    } catch (_) {
      // Org ACL or lookup failed (e.g. app lacks org scopes/Community Management); label as Page for UI
      tokenData.username = 'LinkedIn Page';
    }
  }

  if (plat === 'FACEBOOK' && tokenData.pages && tokenData.pages.length >= 1) {
    const firstPage = tokenData.pages[0];
    const pageToken = firstPage.access_token || tokenData.accessToken;
    const hasRealPageToken = Boolean(firstPage.access_token);
    if (tokenData.pages.length === 1 && hasRealPageToken) {
      try {
        // Upsert first so reconnecting the same Page updates in place and keeps posts/data
        await prisma.socialAccount.upsert({
          where: {
            userId_platform_platformUserId: { userId, platform: 'FACEBOOK', platformUserId: firstPage.id },
          },
          update: {
            accessToken: pageToken,
            refreshToken: tokenData.refreshToken,
            expiresAt: tokenData.expiresAt,
            username: firstPage.name ?? 'Facebook Page',
            profilePicture: firstPage.picture ?? null,
            status: 'connected',
            connectedAt: new Date(),
            disconnectedAt: null,
          },
          create: {
            userId,
            platform: 'FACEBOOK',
            platformUserId: firstPage.id,
            username: firstPage.name ?? 'Facebook Page',
            profilePicture: firstPage.picture ?? null,
            accessToken: pageToken,
            refreshToken: tokenData.refreshToken,
            expiresAt: tokenData.expiresAt,
            status: 'connected',
            firstConnectedAt: new Date(),
            connectedAt: new Date(),
          },
        });
        await prisma.socialAccount.deleteMany({
          where: { userId, platform: 'FACEBOOK', platformUserId: { not: firstPage.id } },
        });
        const igId = (firstPage as { instagram_business_account_id?: string }).instagram_business_account_id;
        if (igId) {
          let igUsername = 'Instagram';
          let igPicture: string | null = null;
          try {
            const igRes = await axios.get<{ username?: string; profile_picture_url?: string }>(
              `https://graph.facebook.com/v18.0/${igId}`,
              { params: { fields: 'username,profile_picture_url', access_token: pageToken } }
            );
            if (igRes.data?.username) igUsername = igRes.data.username;
            if (igRes.data?.profile_picture_url) igPicture = igRes.data.profile_picture_url;
          } catch (_) {}
          await prisma.socialAccount.upsert({
            where: {
              userId_platform_platformUserId: { userId, platform: 'INSTAGRAM', platformUserId: igId },
            },
            update: {
              accessToken: pageToken,
              username: igUsername,
              profilePicture: igPicture,
              expiresAt: tokenData.expiresAt,
              status: 'connected',
              connectedAt: new Date(),
              disconnectedAt: null,
              credentialsJson: { loginMethod: 'facebook_login' as const, linkedPageId: firstPage.id },
            },
            create: {
              userId,
              platform: 'INSTAGRAM',
              platformUserId: igId,
              username: igUsername,
              profilePicture: igPicture,
              accessToken: pageToken,
              refreshToken: null,
              expiresAt: tokenData.expiresAt,
              status: 'connected',
              firstConnectedAt: new Date(),
              connectedAt: new Date(),
              credentialsJson: { loginMethod: 'facebook_login' as const, linkedPageId: firstPage.id },
            },
          });
          await prisma.socialAccount.deleteMany({
            where: { userId, platform: 'INSTAGRAM', platformUserId: { not: igId } },
          });
        }
        const fbAccount = await prisma.socialAccount.findFirst({
          where: { userId, platform: 'FACEBOOK', platformUserId: firstPage.id },
          select: { id: true, userId: true, platform: true, platformUserId: true, accessToken: true },
        });
        if (fbAccount) {
          try { await ensureBootstrapSnapshotForToday(fbAccount); } catch (_) {}
        }
        const igAccount = igId ? await prisma.socialAccount.findFirst({
          where: { userId, platform: 'INSTAGRAM', platformUserId: igId },
          select: { id: true, userId: true, platform: true, platformUserId: true, accessToken: true },
        }) : null;
        if (igAccount) {
          try { await ensureBootstrapSnapshotForToday(igAccount); } catch (_) {}
        }
        const dashboardUrl = fbAccount?.id ? `${baseUrl}/dashboard?accountId=${encodeURIComponent(fbAccount.id)}` : `${baseUrl}/dashboard`;
        return NextResponse.redirect(dashboardUrl);
      } catch (e) {
        console.error('[Social OAuth] Facebook single-page connect error:', e);
      }
    }
    try {
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
      const pagesJson = tokenData.pages.map(({ access_token: _at, ...p }) => p) as object;
      const pending = await prisma.pendingConnection.create({
        data: {
          userId,
          platform: 'FACEBOOK',
          payload: { accessToken: tokenData.accessToken, pages: pagesJson },
          expiresAt,
        },
      });
      const selectUrl = `${baseUrl}/accounts/facebook/select?pendingId=${pending.id}`;
      const html = `<!DOCTYPE html><html><head>${OAUTH_HEAD}<title>Agent4Socials – Choose Page</title></head><body style="font-family:system-ui;max-width:480px;margin:2rem auto;padding:1rem;"><p><strong>Agent4Socials</strong> – Choose one Page to connect.</p><script>window.location.href = ${JSON.stringify(selectUrl)};</script><p>Redirecting to <a href="${selectUrl}">Choose Page</a>…</p></body></html>`;
      return new NextResponse(html, { headers: { 'Content-Type': 'text/html' } });
    } catch (e) {
      console.error('[Social OAuth] pending Facebook create error:', e);
      const firstPage = tokenData.pages![0];
      const pageToken = firstPage.access_token || tokenData.accessToken;
      try {
        await prisma.socialAccount.upsert({
          where: {
            userId_platform_platformUserId: { userId, platform: 'FACEBOOK', platformUserId: firstPage.id },
          },
          update: {
            accessToken: pageToken,
            refreshToken: tokenData.refreshToken,
            expiresAt: tokenData.expiresAt,
            username: firstPage.name ?? 'Facebook Page',
            profilePicture: firstPage.picture ?? null,
            status: 'connected',
            connectedAt: new Date(),
            disconnectedAt: null,
          },
          create: {
            userId,
            platform: 'FACEBOOK',
            platformUserId: firstPage.id,
            username: firstPage.name ?? 'Facebook Page',
            profilePicture: firstPage.picture ?? null,
            accessToken: pageToken,
            refreshToken: tokenData.refreshToken,
            expiresAt: tokenData.expiresAt,
            status: 'connected',
            firstConnectedAt: new Date(),
            connectedAt: new Date(),
          },
        });
        await prisma.socialAccount.deleteMany({
          where: { userId, platform: 'FACEBOOK', platformUserId: { not: firstPage.id } },
        });
        const igId = firstPage.instagram_business_account_id;
        if (igId) {
          let igUsername = 'Instagram';
          let igPicture: string | null = null;
          try {
            const igRes = await axios.get<{ username?: string; profile_picture_url?: string }>(
              `https://graph.facebook.com/v18.0/${igId}`,
              { params: { fields: 'username,profile_picture_url', access_token: pageToken } }
            );
            if (igRes.data?.username) igUsername = igRes.data.username;
            if (igRes.data?.profile_picture_url) igPicture = igRes.data.profile_picture_url;
          } catch (_) {}
          await prisma.socialAccount.upsert({
            where: {
              userId_platform_platformUserId: { userId, platform: 'INSTAGRAM', platformUserId: igId },
            },
            update: {
              accessToken: pageToken,
              username: igUsername,
              profilePicture: igPicture,
              expiresAt: tokenData.expiresAt,
              status: 'connected',
              connectedAt: new Date(),
              disconnectedAt: null,
              credentialsJson: { loginMethod: 'facebook_login' as const, linkedPageId: firstPage.id },
            },
            create: {
              userId,
              platform: 'INSTAGRAM',
              platformUserId: igId,
              username: igUsername,
              profilePicture: igPicture,
              accessToken: pageToken,
              refreshToken: null,
              expiresAt: tokenData.expiresAt,
              status: 'connected',
              firstConnectedAt: new Date(),
              connectedAt: new Date(),
              credentialsJson: { loginMethod: 'facebook_login' as const, linkedPageId: firstPage.id },
            },
          });
          await prisma.socialAccount.deleteMany({
            where: { userId, platform: 'INSTAGRAM', platformUserId: { not: igId } },
          });
        }
        const fbAccount = await prisma.socialAccount.findFirst({
          where: { userId, platform: 'FACEBOOK', platformUserId: firstPage.id },
          select: { id: true, userId: true, platform: true, platformUserId: true, accessToken: true },
        });
        if (fbAccount) { try { await ensureBootstrapSnapshotForToday(fbAccount); } catch (_) {} }
        const igAccountForBootstrap = igId ? await prisma.socialAccount.findFirst({
          where: { userId, platform: 'INSTAGRAM', platformUserId: igId },
          select: { id: true, userId: true, platform: true, platformUserId: true, accessToken: true },
        }) : null;
        if (igAccountForBootstrap) { try { await ensureBootstrapSnapshotForToday(igAccountForBootstrap); } catch (_) {} }
      const dashboardUrl = fbAccount?.id ? `${baseUrl}/dashboard?accountId=${encodeURIComponent(fbAccount.id)}` : `${baseUrl}/dashboard`;
      return NextResponse.redirect(dashboardUrl);
      } catch (fallbackErr) {
        console.error('[Social OAuth] Facebook fallback connect error:', fallbackErr);
        const msg = (fallbackErr as Error)?.message ?? '';
        const hint = msg.includes('does not exist') || msg.includes('relation') ? ' Run database migrations (e.g. npx prisma migrate deploy) and try again.' : '';
        return oauthErrorHtml(baseUrl, `Could not save. Try again.${hint}`, 500);
      }
    }
  }

  if (plat === 'INSTAGRAM' && tokenData.instagramAccounts && tokenData.instagramAccounts.length >= 1) {
    // When there is exactly 1 account (the most common case), skip the select page and connect immediately.
    // Only show the select page if the user has 2+ Instagram Business accounts linked to their Facebook.
    if (tokenData.instagramAccounts.length > 1) {
      try {
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
        const accountsJson = JSON.parse(JSON.stringify(tokenData.instagramAccounts)) as object;
        const pending = await prisma.pendingConnection.create({
          data: {
            userId,
            platform: 'INSTAGRAM',
            payload: { accessToken: tokenData.accessToken, accounts: accountsJson },
            expiresAt,
          },
        });
        const selectUrl = `${baseUrl}/accounts/instagram/select?pendingId=${pending.id}`;
        const html = `<!DOCTYPE html><html><head>${OAUTH_HEAD}<title>Agent4Socials – Choose Instagram account</title></head><body style="font-family:system-ui;max-width:480px;margin:2rem auto;padding:1rem;"><p><strong>Agent4Socials</strong> – Choose one Instagram account to connect.</p><script>window.location.href = ${JSON.stringify(selectUrl)};</script><p>Redirecting to <a href="${selectUrl}">Choose account</a>…</p></body></html>`;
        return new NextResponse(html, { headers: { 'Content-Type': 'text/html' } });
      } catch (e) {
        console.error('[Social OAuth] pending Instagram create error (multi-account):', e);
        // fall through to auto-connect first account below
      }
    }
    // Auto-connect: either there is only 1 account, or the pending connection create failed.
    try {
      // Auto-connect the first (or only) Instagram account.
      const first = tokenData.instagramAccounts![0];
      const pageToken = first.pageAccessToken || tokenData.accessToken;
      const linkedPage = tokenData.linkedPage ?? (first.pageId ? { id: first.pageId, name: first.pageName ?? 'Facebook Page', picture: first.pagePicture ?? null } : undefined);
      const fbLoginCreds = { loginMethod: 'facebook_login' as const, linkedPageId: first.pageId ?? null };
      await prisma.socialAccount.upsert({
        where: {
          userId_platform_platformUserId: { userId, platform: 'INSTAGRAM', platformUserId: first.id },
        },
        update: {
          accessToken: pageToken,
          refreshToken: tokenData.refreshToken,
          expiresAt: tokenData.expiresAt,
          username: first.username ?? 'Instagram',
          profilePicture: first.profilePicture ?? null,
          status: 'connected',
          connectedAt: new Date(),
          disconnectedAt: null,
          credentialsJson: fbLoginCreds,
        },
        create: {
          userId,
          platform: 'INSTAGRAM',
          platformUserId: first.id,
          username: first.username ?? 'Instagram',
          profilePicture: first.profilePicture ?? null,
          accessToken: pageToken,
          refreshToken: tokenData.refreshToken,
          expiresAt: tokenData.expiresAt,
          status: 'connected',
          firstConnectedAt: new Date(),
          connectedAt: new Date(),
          credentialsJson: fbLoginCreds,
        },
      });
      await prisma.socialAccount.deleteMany({
        where: { userId, platform: 'INSTAGRAM', platformUserId: { not: first.id } },
      });
      if (linkedPage) {
        await prisma.socialAccount.upsert({
          where: {
            userId_platform_platformUserId: { userId, platform: 'FACEBOOK', platformUserId: linkedPage.id },
          },
          update: {
            accessToken: pageToken,
            refreshToken: tokenData.refreshToken,
            expiresAt: tokenData.expiresAt,
            username: linkedPage.name,
            profilePicture: linkedPage.picture,
            status: 'connected',
            connectedAt: new Date(),
            disconnectedAt: null,
          },
          create: {
            userId,
            platform: 'FACEBOOK',
            platformUserId: linkedPage.id,
            username: linkedPage.name,
            profilePicture: linkedPage.picture,
            accessToken: pageToken,
            refreshToken: tokenData.refreshToken,
            expiresAt: tokenData.expiresAt,
            status: 'connected',
            firstConnectedAt: new Date(),
            connectedAt: new Date(),
          },
        });
        await prisma.socialAccount.deleteMany({
          where: { userId, platform: 'FACEBOOK', platformUserId: { not: linkedPage.id } },
        });
      }
      const igAccount = await prisma.socialAccount.findFirst({
        where: { userId, platform: 'INSTAGRAM', platformUserId: first.id },
        select: { id: true, userId: true, platform: true, platformUserId: true, accessToken: true },
      });
      if (igAccount) { try { await ensureBootstrapSnapshotForToday(igAccount); } catch (_) {} }
      const dashboardUrl = igAccount?.id ? `${baseUrl}/dashboard?accountId=${encodeURIComponent(igAccount.id)}` : `${baseUrl}/dashboard`;
      return NextResponse.redirect(dashboardUrl);
    } catch (autoConnectErr) {
      console.error('[Social OAuth] Instagram auto-connect error:', autoConnectErr);
      const msg = (autoConnectErr as Error)?.message ?? '';
      const hint = msg.includes('does not exist') || msg.includes('relation') ? ' Run database migrations (e.g. npx prisma migrate deploy) and try again.' : '';
      return oauthErrorHtml(baseUrl, `Could not save. Try again.${hint}`, 500);
    }
  }

  const profilePicture = tokenData.profilePicture ?? undefined;
  // When Instagram is connected via Instagram Business Login (method=instagram), the accessToken
  // IS the long-lived Instagram User Access Token. Mark it so inbox/comments route through graph.instagram.com.
  const igBusinessCreds = (plat === 'INSTAGRAM' && isInstagramLogin)
    ? { loginMethod: 'instagram_business' as const }
    : undefined;
  const twitterCreds = plat === 'TWITTER' && tokenData.twitterGrantedScope
    ? { grantedScope: tokenData.twitterGrantedScope }
    : undefined;
  const pinterestStored =
    plat === 'PINTEREST' && tokenData.pinterestCredentials
      ? {
          pinterestDefaultBoardId: tokenData.pinterestCredentials.defaultBoardId,
          ...(tokenData.pinterestCredentials.boards?.length
            ? { pinterestBoards: tokenData.pinterestCredentials.boards }
            : {}),
        }
      : undefined;
  const credentialsJsonToSet = igBusinessCreds ?? twitterCreds ?? pinterestStored ?? undefined;
  try {
    // Upsert so reconnecting the same account updates in place; preserve history (firstConnectedAt never cleared).
    await prisma.socialAccount.upsert({
      where: {
        userId_platform_platformUserId: {
          userId,
          platform: plat,
          platformUserId: tokenData.platformUserId,
        },
      },
      update: {
        accessToken: tokenData.accessToken,
        refreshToken: tokenData.refreshToken,
        expiresAt: tokenData.expiresAt,
        username: tokenData.username,
        ...(profilePicture !== undefined && { profilePicture }),
        status: 'connected',
        connectedAt: new Date(),
        disconnectedAt: null,
        ...(credentialsJsonToSet && { credentialsJson: credentialsJsonToSet }),
      },
      create: {
        userId,
        platform: plat,
        platformUserId: tokenData.platformUserId,
        username: tokenData.username,
        ...(profilePicture !== undefined && { profilePicture }),
        accessToken: tokenData.accessToken,
        refreshToken: tokenData.refreshToken,
        expiresAt: tokenData.expiresAt,
        status: 'connected',
        firstConnectedAt: new Date(),
        connectedAt: new Date(),
        ...(credentialsJsonToSet && { credentialsJson: credentialsJsonToSet }),
      },
    });
    await prisma.socialAccount.deleteMany({
      where: { userId, platform: plat, platformUserId: { not: tokenData.platformUserId } },
    });
    // Auto-connect linked account: Instagram via Facebook → also create Facebook Page; Facebook → also create linked Instagram
    if (plat === 'INSTAGRAM' && tokenData.linkedPage) {
      await prisma.socialAccount.upsert({
        where: {
          userId_platform_platformUserId: {
            userId,
            platform: 'FACEBOOK',
            platformUserId: tokenData.linkedPage.id,
          },
        },
        update: {
          accessToken: tokenData.accessToken,
          refreshToken: tokenData.refreshToken,
          expiresAt: tokenData.expiresAt,
          username: tokenData.linkedPage.name,
          profilePicture: tokenData.linkedPage.picture,
          status: 'connected',
          connectedAt: new Date(),
          disconnectedAt: null,
        },
        create: {
          userId,
          platform: 'FACEBOOK',
          platformUserId: tokenData.linkedPage.id,
          username: tokenData.linkedPage.name,
          profilePicture: tokenData.linkedPage.picture,
          accessToken: tokenData.accessToken,
          refreshToken: tokenData.refreshToken,
          expiresAt: tokenData.expiresAt,
          status: 'connected',
          firstConnectedAt: new Date(),
          connectedAt: new Date(),
        },
      });
      await prisma.socialAccount.deleteMany({
        where: { userId, platform: 'FACEBOOK', platformUserId: { not: tokenData.linkedPage.id } },
      });
    }
    if (plat === 'FACEBOOK' && tokenData.linkedInstagram) {
      const fbLinkedIgCreds = { loginMethod: 'facebook_login' as const, linkedPageId: tokenData.platformUserId };
      await prisma.socialAccount.upsert({
        where: {
          userId_platform_platformUserId: {
            userId,
            platform: 'INSTAGRAM',
            platformUserId: tokenData.linkedInstagram.id,
          },
        },
        update: {
          accessToken: tokenData.accessToken,
          refreshToken: tokenData.refreshToken,
          expiresAt: tokenData.expiresAt,
          username: tokenData.linkedInstagram.username ?? 'Instagram',
          profilePicture: tokenData.linkedInstagram.profilePicture ?? null,
          status: 'connected',
          connectedAt: new Date(),
          disconnectedAt: null,
          credentialsJson: fbLinkedIgCreds,
        },
        create: {
          userId,
          platform: 'INSTAGRAM',
          platformUserId: tokenData.linkedInstagram.id,
          username: tokenData.linkedInstagram.username ?? 'Instagram',
          profilePicture: tokenData.linkedInstagram.profilePicture ?? null,
          accessToken: tokenData.accessToken,
          refreshToken: tokenData.refreshToken,
          expiresAt: tokenData.expiresAt,
          status: 'connected',
          firstConnectedAt: new Date(),
          connectedAt: new Date(),
          credentialsJson: fbLinkedIgCreds,
        },
      });
      await prisma.socialAccount.deleteMany({
        where: { userId, platform: 'INSTAGRAM', platformUserId: { not: tokenData.linkedInstagram.id } },
      });
    }
  } catch (e) {
    console.error('[Social OAuth] upsert error:', e);
    return oauthErrorHtml(baseUrl, 'Could not save account. Check database connection and schema.', 500);
  }

  const mainAccount = await prisma.socialAccount.findFirst({
    where: { userId, platform: plat, platformUserId: tokenData.platformUserId },
    select: { id: true, userId: true, platform: true, platformUserId: true, accessToken: true },
  });
  // Bootstrap follower/following snapshot for Instagram and Facebook only (YouTube excluded).
  if (mainAccount && (plat === 'INSTAGRAM' || plat === 'FACEBOOK')) {
    try {
      await ensureBootstrapSnapshotForToday(mainAccount);
    } catch (e) {
      console.warn('[OAuth] Bootstrap metric snapshot:', (e as Error)?.message ?? e);
    }
  }
  const successRedirectUrl = mainAccount?.id
    ? `${baseUrl}/dashboard?accountId=${encodeURIComponent(mainAccount.id)}`
    : `${baseUrl}/dashboard`;
  return NextResponse.redirect(successRedirectUrl);
}
