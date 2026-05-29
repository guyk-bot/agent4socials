/** LinkedIn OAuth scope sets for personal profile vs Company Page (Community Management). */

export type LinkedInConnectMethod = 'personal' | 'page';

const OPENID_BASE = 'openid profile email r_liteprofile';

/** Personal: publish and moderate comments on the member's own posts. */
export const LINKEDIN_PERSONAL_OAUTH_SCOPES = `${OPENID_BASE} w_member_social r_member_social`;

/** Company Page: Community Management (posts, comments, org analytics). */
export const LINKEDIN_PAGE_OAUTH_SCOPES = `${OPENID_BASE} w_organization_social r_organization_social`;

export function buildLinkedInOAuthScopeString(method?: LinkedInConnectMethod): string {
  const envOverride =
    typeof process.env.LINKEDIN_OAUTH_SCOPES === 'string' && process.env.LINKEDIN_OAUTH_SCOPES.trim()
      ? process.env.LINKEDIN_OAUTH_SCOPES.trim()
      : '';
  if (envOverride) return envOverride.replace(/\s+/g, ' ').trim();

  if (method === 'page') return LINKEDIN_PAGE_OAUTH_SCOPES;
  if (method === 'personal') return LINKEDIN_PERSONAL_OAUTH_SCOPES;

  // Legacy: env toggles on generic connect (no method).
  const requestOrgScopes = process.env.LINKEDIN_REQUEST_ORG_SCOPES === 'true';
  const includeWrite =
    process.env.LINKEDIN_INCLUDE_W_MEMBER_SOCIAL === 'true' || process.env.LINKEDIN_REQUEST_ORG_SCOPES === 'true';
  const includeMemberSocialRead = process.env.LINKEDIN_INCLUDE_R_MEMBER_SOCIAL === 'true';
  const baseScopes = includeWrite ? `${OPENID_BASE} w_member_social` : 'openid profile email';
  const memberReadScope = includeMemberSocialRead ? ' r_member_social' : '';
  const defaultScopes = `${requestOrgScopes ? `${baseScopes} r_organization_social w_organization_social` : baseScopes}${memberReadScope}`
    .replace(/\s+/g, ' ')
    .trim();
  return defaultScopes;
}
