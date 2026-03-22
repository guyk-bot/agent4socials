/**
 * Page /insights metric names are versioned. v18 rejects newer metrics (e.g. page_media_view).
 * Set META_GRAPH_API_VERSION=24.0 or v24.0 in env if Meta documents a required minimum.
 */
function normalizeGraphInsightsVersion(): string {
  const raw = process.env.META_GRAPH_API_VERSION?.trim();
  if (!raw) return 'v22.0';
  return raw.startsWith('v') ? raw : `v${raw}`;
}

export const META_GRAPH_INSIGHTS_VERSION = normalizeGraphInsightsVersion();

export const metaGraphInsightsBaseUrl = `https://graph.facebook.com/${META_GRAPH_INSIGHTS_VERSION}`;
