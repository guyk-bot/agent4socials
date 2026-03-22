/**
 * Single Graph API version for all graph.facebook.com Page and insights calls in this app.
 * Mixing v18 profile calls with v22 insights caused confusing failures; Meta also returns
 * paging.next URLs on a different version than the initial request (see debug JSON).
 *
 * Default v22.0: Page insights metric names align with current Meta expectations.
 * Override with META_GRAPH_API_VERSION=24.0 (or v24.0) if you standardize on a newer release.
 */
function normalizeFacebookGraphVersion(): string {
  const raw = process.env.META_GRAPH_API_VERSION?.trim();
  if (!raw) return 'v22.0';
  return raw.startsWith('v') ? raw : `v${raw}`;
}

export const META_GRAPH_FACEBOOK_API_VERSION = normalizeFacebookGraphVersion();

/** @deprecated Use META_GRAPH_FACEBOOK_API_VERSION */
export const META_GRAPH_INSIGHTS_VERSION = META_GRAPH_FACEBOOK_API_VERSION;

/** All Facebook Page REST + /insights + debug_token on graph.facebook.com */
export const facebookGraphBaseUrl = `https://graph.facebook.com/${META_GRAPH_FACEBOOK_API_VERSION}`;

/** Alias: insights use the same host/version as profile/posts in production. */
export const metaGraphInsightsBaseUrl = facebookGraphBaseUrl;
