import axios from 'axios';
import { prisma } from '@/lib/db';
import { bootstrapLinkedInAfterConnect } from '@/lib/linkedin/bootstrap-after-connect';
import { resolveLinkedInAuthorUrn } from '@/lib/linkedin/rest-person';
import { linkedInRestCommunityHeaders } from '@/lib/linkedin/rest-config';
import { buildPostConnectDashboardPath } from '@/lib/post-connect-dashboard-url';
import type { LinkedInConnectMethod } from '@/lib/linkedin/oauth-scopes';

export type LinkedInConsentPreviewPayload = {
  step?: string;
  method?: LinkedInConnectMethod;
  memberName?: string;
  memberPicture?: string | null;
  linkedInSub?: string;
  accessToken?: string;
  refreshToken?: string | null;
  expiresAt?: string;
  linkedinGrantedScope?: string;
  returnTo?: string;
  consentApproved?: boolean;
};

async function resolveLinkedInPageProfile(accessToken: string): Promise<{
  platformUserId: string;
  username: string;
}> {
  let platformUserId = 'linkedin-page';
  let username = 'LinkedIn Page';
  try {
    const aclRes = await axios.get<{ elements?: Array<{ organization?: string }> }>(
      'https://api.linkedin.com/rest/organizationAcls?q=roleAssignee&role=ADMINISTRATOR',
      { headers: linkedInRestCommunityHeaders(accessToken) }
    );
    const orgUrn = aclRes.data?.elements?.[0]?.organization;
    if (orgUrn && typeof orgUrn === 'string') {
      platformUserId = orgUrn;
      const orgId = orgUrn.replace(/^urn:li:organization:/i, '') || orgUrn;
      try {
        const orgRes = await axios.get<{
          localizedName?: string;
          name?: { localized?: Record<string, string> };
        }>(`https://api.linkedin.com/rest/organizations/${encodeURIComponent(orgId)}`, {
          headers: linkedInRestCommunityHeaders(accessToken),
        });
        const name =
          orgRes.data?.localizedName ??
          (orgRes.data?.name?.localized && Object.values(orgRes.data.name.localized)[0]);
        if (name) username = name;
      } catch {
        // keep default label
      }
    }
  } catch {
    // org ACL unavailable
  }
  return { platformUserId, username };
}

export async function finalizeLinkedInPendingConnect(
  userId: string,
  previewId: string
): Promise<{ redirect: string; accountId: string }> {
  const pending = await prisma.pendingConnection.findUnique({ where: { id: previewId } });
  if (!pending || pending.userId !== userId || pending.platform !== 'LINKEDIN') {
    throw new Error('Not found or expired');
  }
  if (pending.expiresAt && new Date() > pending.expiresAt) {
    await prisma.pendingConnection.delete({ where: { id: previewId } }).catch(() => {});
    throw new Error('Expired');
  }
  const payload = (pending.payload ?? {}) as LinkedInConsentPreviewPayload;
  if (payload.step !== 'consent_preview' || !payload.accessToken) {
    throw new Error('Invalid session');
  }

  const method: LinkedInConnectMethod = payload.method === 'page' ? 'page' : 'personal';
  const accessToken = payload.accessToken;
  const grantedScope =
    typeof payload.linkedinGrantedScope === 'string' ? payload.linkedinGrantedScope.trim() : '';

  let platformUserId = payload.linkedInSub ?? 'linkedin-member';
  let username = payload.memberName ?? 'LinkedIn';
  const profilePicture = payload.memberPicture ?? null;
  const expiresAt = payload.expiresAt ? new Date(payload.expiresAt) : new Date(Date.now() + 3600 * 1000);

  if (method === 'page') {
    const pageProfile = await resolveLinkedInPageProfile(accessToken);
    platformUserId = pageProfile.platformUserId;
    username = pageProfile.username;
  }

  const prev = await prisma.socialAccount.findFirst({
    where: { userId, platform: 'LINKEDIN', platformUserId },
    select: { credentialsJson: true },
  });
  const prevObj =
    prev?.credentialsJson && typeof prev.credentialsJson === 'object' && prev.credentialsJson !== null
      ? { ...(prev.credentialsJson as Record<string, unknown>) }
      : {};

  let credentialsJson: Record<string, unknown>;
  if (method === 'page') {
    const orgUrn =
      typeof platformUserId === 'string' && platformUserId.startsWith('urn:li:organization:')
        ? platformUserId
        : undefined;
    credentialsJson = {
      ...prevObj,
      linkedinConnectionKind: 'organization_page',
      ...(orgUrn ? { linkedinOrganizationUrn: orgUrn } : {}),
      ...(grantedScope ? { linkedinGrantedScope: grantedScope } : {}),
    };
  } else {
    const resolved = await resolveLinkedInAuthorUrn(accessToken, { platformUserId });
    credentialsJson = resolved.personUrn
      ? {
          ...prevObj,
          linkedinConnectionKind: 'personal',
          linkedinRestPersonUrn: resolved.personUrn,
          ...(grantedScope ? { linkedinGrantedScope: grantedScope } : {}),
        }
      : {
          ...prevObj,
          linkedinConnectionKind: 'personal',
          ...(grantedScope ? { linkedinGrantedScope: grantedScope } : {}),
        };
  }

  await prisma.socialAccount.upsert({
    where: {
      userId_platform_platformUserId: { userId, platform: 'LINKEDIN', platformUserId },
    },
    update: {
      accessToken,
      refreshToken: payload.refreshToken ?? null,
      expiresAt,
      username,
      ...(profilePicture ? { profilePicture } : {}),
      status: 'connected',
      connectedAt: new Date(),
      disconnectedAt: null,
      credentialsJson,
    },
    create: {
      userId,
      platform: 'LINKEDIN',
      platformUserId,
      username,
      ...(profilePicture ? { profilePicture } : {}),
      accessToken,
      refreshToken: payload.refreshToken ?? null,
      expiresAt,
      status: 'connected',
      firstConnectedAt: new Date(),
      connectedAt: new Date(),
      credentialsJson,
    },
  });

  await prisma.socialAccount.deleteMany({
    where: { userId, platform: 'LINKEDIN', platformUserId: { not: platformUserId } },
  });

  const account = await prisma.socialAccount.findFirst({
    where: { userId, platform: 'LINKEDIN', platformUserId },
    select: { id: true, platformUserId: true, accessToken: true, credentialsJson: true, username: true, profilePicture: true },
  });

  if (!account?.accessToken) {
    throw new Error('Could not save LinkedIn account');
  }

  try {
    await bootstrapLinkedInAfterConnect(account);
  } catch (e) {
    console.warn('[LinkedIn finalize] bootstrap:', (e as Error)?.message ?? e);
  }

  await prisma.pendingConnection.delete({ where: { id: previewId } }).catch(() => {});

  const redirect = buildPostConnectDashboardPath(
    account.id,
    'LINKEDIN',
    account.username,
    account.profilePicture
  );
  return { redirect, accountId: account.id };
}
