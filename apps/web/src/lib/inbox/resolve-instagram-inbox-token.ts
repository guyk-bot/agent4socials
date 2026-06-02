import { prisma } from '@/lib/db';
import axios from 'axios';
import { facebookGraphBaseUrl } from '@/lib/meta-graph-insights';

/**
 * Instagram DMs via Facebook Login must use the Page access token for the linked Page,
 * not a stale copy on the Instagram row.
 */
export async function resolveInstagramInboxPageContext(
  userId: string,
  instagramAccount: {
    id: string;
    platformUserId: string;
    accessToken: string;
    credentialsJson: unknown;
  }
): Promise<{
  pageId: string;
  pageAccessToken: string;
  pageMismatch?: string;
} | null> {
  const cred = (instagramAccount.credentialsJson && typeof instagramAccount.credentialsJson === 'object'
    ? instagramAccount.credentialsJson
    : {}) as { linkedPageId?: string; loginMethod?: string };

  let pageId = cred.linkedPageId?.trim() || '';
  if (!pageId) {
    const fb = await prisma.socialAccount.findFirst({
      where: { userId, platform: 'FACEBOOK', status: 'connected' },
      select: { platformUserId: true, accessToken: true },
      orderBy: { updatedAt: 'desc' },
    });
    pageId = fb?.platformUserId?.trim() ?? '';
    if (!pageId) return null;
  }

  const fbPage = await prisma.socialAccount.findFirst({
    where: { userId, platform: 'FACEBOOK', platformUserId: pageId, status: 'connected' },
    select: { platformUserId: true, accessToken: true },
  });
  const pageAccessToken = (fbPage?.accessToken || instagramAccount.accessToken || '').trim();
  if (!pageAccessToken) return null;

  return {
    pageId,
    pageAccessToken,
  };
}

export async function verifyInstagramLinkedToPage(
  pageId: string,
  pageToken: string,
  igPlatformUserId: string
): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    const res = await axios.get<{ instagram_business_account?: { id?: string } }>(
      `${facebookGraphBaseUrl}/${pageId}`,
      {
        params: { fields: 'instagram_business_account{id}', access_token: pageToken },
        timeout: 15_000,
      }
    );
    const linkedIgId = res.data?.instagram_business_account?.id;
    if (!linkedIgId) {
      return {
        ok: false,
        message:
          'This Facebook Page is not linked to an Instagram professional account. In Meta Business Suite, link Instagram to the Page, then reconnect here.',
      };
    }
    if (linkedIgId !== igPlatformUserId) {
      return {
        ok: false,
        message:
          'The Facebook Page you connected is linked to a different Instagram profile than the one in Agent4Socials. Reconnect via Facebook and choose the Page tied to this Instagram account.',
      };
    }
    return { ok: true };
  } catch {
    return {
      ok: false,
      message:
        'Could not verify that your Facebook Page matches this Instagram account. Reconnect via Facebook and choose the correct Page.',
    };
  }
}
