import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { Platform } from '@prisma/client';
import axios from 'axios';

const PLATFORMS = ['INSTAGRAM', 'TIKTOK', 'YOUTUBE', 'FACEBOOK', 'TWITTER', 'LINKEDIN'] as const;

function oauthErrorHtml(baseUrl: string, message: string, status: number): NextResponse {
  const dashboardUrl = `${baseUrl.replace(/\/+$/, '')}/dashboard`;
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Connection failed</title></head><body style="font-family:system-ui;max-width:480px;margin:2rem auto;padding:1rem;">
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
  /** When multiple Facebook Pages, list for user to pick one (access_token is the Page token) */
  pages?: Array<{ id: string; name?: string; picture?: string; instagram_business_account_id?: string; access_token?: string }>;
  /** When multiple Instagram Business accounts (via Facebook), list for user to pick one */
  instagramAccounts?: Array<{ id: string; username?: string; profilePicture?: string; pageId?: string; pageName?: string; pagePicture?: string; pageAccessToken?: string }>;
  /** When connecting Instagram via Facebook: the linked Page to also create as FACEBOOK */
  linkedPage?: { id: string; name: string; picture: string | null };
  /** When connecting Facebook: the linked Instagram Business account to also create as INSTAGRAM */
  linkedInstagram?: { id: string; username?: string; profilePicture?: string };
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
      const r = await axios.post('https://open-api.tiktok.com/oauth/access_token/', {
        client_key: process.env.TIKTOK_CLIENT_KEY,
        client_secret: process.env.TIKTOK_CLIENT_SECRET,
        code,
        grant_type: 'authorization_code',
      });
      const d = r.data?.data;
      return {
        accessToken: d.access_token,
        refreshToken: d.refresh_token ?? null,
        expiresAt: new Date(Date.now() + (d.expires_in || 86400) * 1000),
        platformUserId: d.open_id || 'tiktok-id',
        username: 'TikTok User',
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
      return {
        accessToken: r.data.access_token,
        refreshToken: r.data.refresh_token ?? null,
        expiresAt: new Date(Date.now() + (r.data.expires_in || 3600) * 1000),
        platformUserId: 'youtube-' + (r.data.access_token?.slice(-8) || 'id'),
        username: 'YouTube Channel',
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

  if (!code || !stateRaw) {
    return NextResponse.json({ error: 'Missing code or state' }, { status: 400 });
  }

  const isInstagramLogin = stateRaw.includes(':instagram');
  const isLinkedInPage = stateRaw.includes(':linkedin_page');
  const userId = isInstagramLogin ? stateRaw.replace(/:instagram$/, '') : isLinkedInPage ? stateRaw.replace(/:linkedin_page$/, '') : stateRaw;

  const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL || 'https://agent4socials.com').replace(/\/+$/, '');
  const defaultCallbackUrl = `${baseUrl}/api/social/oauth/${platform}/callback`;
  let callbackUrl = defaultCallbackUrl;
  if (plat === 'INSTAGRAM' && isInstagramLogin && process.env.INSTAGRAM_REDIRECT_URI) {
    callbackUrl = process.env.INSTAGRAM_REDIRECT_URI.replace(/\/+$/, '');
  } else if (plat === 'FACEBOOK' && process.env.FACEBOOK_REDIRECT_URI) {
    callbackUrl = process.env.FACEBOOK_REDIRECT_URI.replace(/\/+$/, '');
  } else if (plat === 'YOUTUBE' && process.env.YOUTUBE_REDIRECT_URI) {
    callbackUrl = process.env.YOUTUBE_REDIRECT_URI.replace(/\/+$/, '');
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
      // Org ACL or lookup failed (e.g. app lacks Community Management); keep tokenData as personal
    }
  }

  if (plat === 'FACEBOOK' && tokenData.pages && tokenData.pages.length >= 1) {
    try {
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
      const pagesJson = tokenData.pages.map(({ access_token: _at, ...p }) => p) as object;
      const pending = await prisma.pendingFacebookConnection.create({
        data: {
          userId,
          accessToken: tokenData.accessToken,
          pages: pagesJson,
          expiresAt,
        },
      });
      const selectUrl = `${baseUrl}/accounts/facebook/select?pendingId=${pending.id}`;
      const html = `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body><p>Choose one Page to connect.</p><script>window.location.href = ${JSON.stringify(selectUrl)};</script><p>Redirecting to <a href="${selectUrl}">Choose Page</a>…</p></body></html>`;
      return new NextResponse(html, { headers: { 'Content-Type': 'text/html' } });
    } catch (e) {
      console.error('[Social OAuth] pending Facebook create error:', e);
      const firstPage = tokenData.pages![0];
      const pageToken = firstPage.access_token || tokenData.accessToken;
      try {
        await prisma.socialAccount.deleteMany({ where: { userId, platform: 'FACEBOOK' } });
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
          },
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
          await prisma.socialAccount.deleteMany({ where: { userId, platform: 'INSTAGRAM' } });
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
            },
          });
        }
        const dashboardUrl = `${baseUrl}/dashboard?connecting=1`;
        const html = `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body><p>Page connected.</p><script>window.location.href = ${JSON.stringify(dashboardUrl)};</script><p><a href="${dashboardUrl}">Go to Dashboard</a></p></body></html>`;
        return new NextResponse(html, { headers: { 'Content-Type': 'text/html' } });
      } catch (fallbackErr) {
        console.error('[Social OAuth] Facebook fallback connect error:', fallbackErr);
        const msg = (fallbackErr as Error)?.message ?? '';
        const hint = msg.includes('does not exist') || msg.includes('relation') ? ' Run database migrations (e.g. npx prisma migrate deploy) and try again.' : '';
        return oauthErrorHtml(baseUrl, `Could not save. Try again.${hint}`, 500);
      }
    }
  }

  if (plat === 'INSTAGRAM' && tokenData.instagramAccounts && tokenData.instagramAccounts.length >= 1) {
    try {
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
      const accountsJson = JSON.parse(JSON.stringify(tokenData.instagramAccounts)) as object;
      const pending = await prisma.pendingInstagramConnection.create({
        data: {
          userId,
          accessToken: tokenData.accessToken,
          accounts: accountsJson,
          expiresAt,
        },
      });
      const selectUrl = `${baseUrl}/accounts/instagram/select?pendingId=${pending.id}`;
      const html = `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body><p>Choose one Instagram account to connect.</p><script>window.location.href = ${JSON.stringify(selectUrl)};</script><p>Redirecting to <a href="${selectUrl}">Choose account</a>…</p></body></html>`;
      return new NextResponse(html, { headers: { 'Content-Type': 'text/html' } });
    } catch (e) {
      console.error('[Social OAuth] pending Instagram create error:', e);
      // Fallback: connect the first Instagram account (and linked Page). Use Page token when available so insights/posts/inbox work.
      const first = tokenData.instagramAccounts![0];
      const pageToken = first.pageAccessToken || tokenData.accessToken;
      const linkedPage = tokenData.linkedPage ?? (first.pageId ? { id: first.pageId, name: first.pageName ?? 'Facebook Page', picture: first.pagePicture ?? null } : undefined);
      try {
        await prisma.socialAccount.deleteMany({ where: { userId, platform: 'INSTAGRAM' } });
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
          },
        });
        if (linkedPage) {
          await prisma.socialAccount.deleteMany({ where: { userId, platform: 'FACEBOOK' } });
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
            },
          });
        }
        const dashboardUrl = `${baseUrl}/dashboard?connecting=1`;
        const html = `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body><p>Account connected.</p><script>window.location.href = ${JSON.stringify(dashboardUrl)};</script><p><a href="${dashboardUrl}">Go to Dashboard</a></p></body></html>`;
        return new NextResponse(html, { headers: { 'Content-Type': 'text/html' } });
      } catch (fallbackErr) {
        console.error('[Social OAuth] Instagram fallback connect error:', fallbackErr);
        const msg = (fallbackErr as Error)?.message ?? '';
        const hint = msg.includes('does not exist') || msg.includes('relation') ? ' Run database migrations (e.g. npx prisma migrate deploy) and try again.' : '';
        return oauthErrorHtml(baseUrl, `Could not save. Try again.${hint}`, 500);
      }
    }
  }

  const profilePicture = tokenData.profilePicture ?? undefined;
  try {
    await prisma.socialAccount.deleteMany({ where: { userId, platform: plat } });
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
      },
    });
    // Auto-connect linked account: Instagram via Facebook → also create Facebook Page; Facebook → also create linked Instagram
    if (plat === 'INSTAGRAM' && tokenData.linkedPage) {
      await prisma.socialAccount.deleteMany({ where: { userId, platform: 'FACEBOOK' } });
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
        },
      });
    }
    if (plat === 'FACEBOOK' && tokenData.linkedInstagram) {
      await prisma.socialAccount.deleteMany({ where: { userId, platform: 'INSTAGRAM' } });
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
        },
      });
    }
  } catch (e) {
    console.error('[Social OAuth] upsert error:', e);
    return oauthErrorHtml(baseUrl, 'Could not save account. Check database connection and schema.', 500);
  }

  const dashboardUrl = `${baseUrl}/dashboard?connecting=1`;
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body><p>Account connected.</p><script>
(function(){
  if (window.opener) {
    try { window.close(); } catch (e) {}
  } else {
    window.location.href = ${JSON.stringify(dashboardUrl)};
  }
})();
</script><p>Redirecting to <a href="${dashboardUrl}">Dashboard</a>…</p></body></html>`;
  return new NextResponse(html, { headers: { 'Content-Type': 'text/html' } });
}
