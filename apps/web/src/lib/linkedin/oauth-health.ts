/** Client-safe LinkedIn connection flags derived from stored OAuth credentials. */

export type LinkedInOAuthHealth = {
  linkedinPublishReady: boolean;
  linkedinSyncReady: boolean;
  linkedinReconnectHint?: string;
};

export function linkedInOAuthHealthFromCredentials(credentialsJson: unknown): LinkedInOAuthHealth {
  const cred =
    credentialsJson && typeof credentialsJson === 'object'
      ? (credentialsJson as {
          linkedinRestPersonUrn?: string;
          linkedinGrantedScope?: string;
        })
      : {};
  const scope = typeof cred.linkedinGrantedScope === 'string' ? cred.linkedinGrantedScope : '';
  const urn = typeof cred.linkedinRestPersonUrn === 'string' ? cred.linkedinRestPersonUrn.trim() : '';
  const hasUrn = urn.startsWith('urn:li:person:') || urn.startsWith('urn:li:organization:');
  const hasWrite = /\bw_member_social\b/.test(scope);
  const hasRead = /\br_member_social\b/.test(scope);

  if (!hasUrn) {
    return {
      linkedinPublishReady: false,
      linkedinSyncReady: false,
      linkedinReconnectHint:
        'Reconnect LinkedIn so we can store your profile ID for posting. Confirm LINKEDIN_INCLUDE_W_MEMBER_SOCIAL=true in Vercel, redeploy, then Reconnect.',
    };
  }
  if (!hasWrite) {
    return {
      linkedinPublishReady: false,
      linkedinSyncReady: hasRead,
      linkedinReconnectHint:
        'Reconnect to enable posting. Your token may be missing w_member_social. Set LINKEDIN_INCLUDE_W_MEMBER_SOCIAL=true in Vercel, redeploy, then Reconnect.',
    };
  }
  if (!hasRead) {
    return {
      linkedinPublishReady: true,
      linkedinSyncReady: false,
    };
  }
  return { linkedinPublishReady: true, linkedinSyncReady: true };
}
