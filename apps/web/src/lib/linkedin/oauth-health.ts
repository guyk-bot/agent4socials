/** Client-safe LinkedIn connection flags derived from stored OAuth credentials. */

export type LinkedInConnectionKind = 'personal' | 'organization_page';

export type LinkedInOAuthHealth = {
  linkedinConnectionKind?: LinkedInConnectionKind;
  linkedinPublishReady: boolean;
  linkedinSyncReady: boolean;
  linkedinReconnectHint?: string;
};

function readLinkedInCreds(credentialsJson: unknown) {
  if (!credentialsJson || typeof credentialsJson !== 'object') {
    return {
      scope: '',
      urn: '',
      kind: undefined as LinkedInConnectionKind | undefined,
    };
  }
  const cred = credentialsJson as {
    linkedinRestPersonUrn?: string;
    linkedinOrganizationUrn?: string;
    linkedinGrantedScope?: string;
    linkedinConnectionKind?: string;
  };
  const scope = typeof cred.linkedinGrantedScope === 'string' ? cred.linkedinGrantedScope : '';
  const personUrn =
    typeof cred.linkedinRestPersonUrn === 'string' ? cred.linkedinRestPersonUrn.trim() : '';
  const orgUrn =
    typeof cred.linkedinOrganizationUrn === 'string' ? cred.linkedinOrganizationUrn.trim() : '';
  const kindRaw = cred.linkedinConnectionKind;
  const kind: LinkedInConnectionKind | undefined =
    kindRaw === 'organization_page' || kindRaw === 'personal' ? kindRaw : undefined;
  const urn =
    kind === 'organization_page'
      ? orgUrn.startsWith('urn:li:organization:')
        ? orgUrn
        : ''
      : personUrn.startsWith('urn:li:person:') || personUrn.startsWith('urn:li:organization:')
        ? personUrn
        : '';
  return { scope, urn, kind };
}

export function linkedInOAuthHealthFromCredentials(credentialsJson: unknown): LinkedInOAuthHealth {
  const { scope, urn, kind } = readLinkedInCreds(credentialsJson);
  const isPage = kind === 'organization_page' || /\bw_organization_social\b/.test(scope);
  const hasUrn = urn.length > 0;
  const hasMemberWrite = /\bw_member_social\b/.test(scope);
  const hasMemberRead = /\br_member_social\b/.test(scope);
  const hasOrgWrite = /\bw_organization_social\b/.test(scope);
  const hasOrgRead = /\br_organization_social\b/.test(scope);

  const connectionKind: LinkedInConnectionKind | undefined = isPage
    ? 'organization_page'
    : kind === 'personal' || hasMemberWrite || hasMemberRead
      ? 'personal'
      : kind;

  if (isPage) {
    if (!hasOrgWrite && !hasOrgRead) {
      return {
        linkedinConnectionKind: 'organization_page',
        linkedinPublishReady: false,
        linkedinSyncReady: false,
        linkedinReconnectHint:
          'Reconnect using Company Page and accept organization permissions (Community Management).',
      };
    }
    return {
      linkedinConnectionKind: 'organization_page',
      linkedinPublishReady: hasOrgWrite,
      linkedinSyncReady: hasOrgRead,
      ...(!hasOrgWrite
        ? {
            linkedinReconnectHint:
              'Reconnect Company Page to enable publishing (w_organization_social).',
          }
        : {}),
    };
  }

  if (!hasUrn) {
    return {
      linkedinConnectionKind: connectionKind ?? 'personal',
      linkedinPublishReady: false,
      linkedinSyncReady: false,
      linkedinReconnectHint:
        'Reconnect your personal profile using the Personal option so we can store your LinkedIn author ID.',
    };
  }
  if (!hasMemberWrite) {
    return {
      linkedinConnectionKind: 'personal',
      linkedinPublishReady: false,
      linkedinSyncReady: hasMemberRead,
      linkedinReconnectHint:
        'Reconnect personal profile to enable posting (w_member_social).',
    };
  }
  if (!hasMemberRead) {
    return {
      linkedinConnectionKind: 'personal',
      linkedinPublishReady: true,
      linkedinSyncReady: false,
      linkedinReconnectHint:
        'Reconnect personal profile to load comments on your posts (r_member_social).',
    };
  }
  return {
    linkedinConnectionKind: 'personal',
    linkedinPublishReady: true,
    linkedinSyncReady: true,
  };
}

/** OAuth start `method` query for reconnecting the same connection type. */
export function linkedInReconnectMethod(
  connectionKind: LinkedInConnectionKind | undefined
): 'personal' | 'page' {
  return connectionKind === 'organization_page' ? 'page' : 'personal';
}
