/** LinkedIn OAuth scope sets for personal profile vs Company Page (Community Management). */

export type LinkedInConnectMethod = 'personal' | 'page';

const OPENID_BASE = 'openid profile email r_liteprofile';

/** Publish (Share on LinkedIn). */
const MEMBER_PUBLISH = 'w_member_social';

/** Read posts + comments (Community Management member). */
const MEMBER_READ = 'r_member_social';

/** Post impressions / engagement metrics (memberCreatorPostAnalytics). */
const MEMBER_POST_ANALYTICS = 'r_member_postAnalytics';

/**
 * Personal profile: full Share + Community Management member read (posts, comments, metrics).
 * Set LINKEDIN_PERSONAL_PUBLISH_ONLY=true in Vercel to request publish-only scopes if OAuth fails.
 */
export const LINKEDIN_PERSONAL_OAUTH_SCOPES_FULL =
  `${OPENID_BASE} ${MEMBER_PUBLISH} ${MEMBER_READ} ${MEMBER_POST_ANALYTICS}`.replace(/\s+/g, ' ').trim();

export const LINKEDIN_PERSONAL_OAUTH_SCOPES_PUBLISH_ONLY =
  `${OPENID_BASE} ${MEMBER_PUBLISH}`.replace(/\s+/g, ' ').trim();

/** @deprecated use LINKEDIN_PERSONAL_OAUTH_SCOPES_PUBLISH_ONLY or FULL */
export const LINKEDIN_PERSONAL_OAUTH_SCOPES = LINKEDIN_PERSONAL_OAUTH_SCOPES_FULL;

/** Company Page: publish + read org posts/comments/metrics. */
export const LINKEDIN_PAGE_OAUTH_SCOPES =
  `${OPENID_BASE} w_organization_social r_organization_social`.replace(/\s+/g, ' ').trim();

function linkedInPersonalScopesForConnect(): string {
  if (process.env.LINKEDIN_PERSONAL_PUBLISH_ONLY === 'true') {
    return LINKEDIN_PERSONAL_OAUTH_SCOPES_PUBLISH_ONLY;
  }
  if (process.env.LINKEDIN_INCLUDE_R_MEMBER_SOCIAL === 'false') {
    return LINKEDIN_PERSONAL_OAUTH_SCOPES_PUBLISH_ONLY;
  }
  const parts = LINKEDIN_PERSONAL_OAUTH_SCOPES_PUBLISH_ONLY.split(/\s+/);
  parts.push(MEMBER_READ);
  if (process.env.LINKEDIN_INCLUDE_R_MEMBER_POST_ANALYTICS !== 'false') {
    parts.push(MEMBER_POST_ANALYTICS);
  }
  return [...new Set(parts)].join(' ');
}

export function buildLinkedInOAuthScopeString(method?: LinkedInConnectMethod): string {
  const envOverride =
    typeof process.env.LINKEDIN_OAUTH_SCOPES === 'string' && process.env.LINKEDIN_OAUTH_SCOPES.trim()
      ? process.env.LINKEDIN_OAUTH_SCOPES.trim()
      : '';
  if (envOverride) return envOverride.replace(/\s+/g, ' ').trim();

  if (method === 'page') return LINKEDIN_PAGE_OAUTH_SCOPES;
  if (method === 'personal') return linkedInPersonalScopesForConnect();

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
