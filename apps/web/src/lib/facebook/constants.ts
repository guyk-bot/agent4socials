import { META_GRAPH_FACEBOOK_API_VERSION, facebookGraphBaseUrl } from '@/lib/meta-graph-insights';

/** Same version as Page insights (env META_GRAPH_API_VERSION, default v22.0). */
export const FB_REST_API_VERSION = META_GRAPH_FACEBOOK_API_VERSION;
export const fbRestBaseUrl = facebookGraphBaseUrl;

export { META_GRAPH_FACEBOOK_API_VERSION, META_GRAPH_INSIGHTS_VERSION, metaGraphInsightsBaseUrl } from '@/lib/meta-graph-insights';

/** How long to trust cached metric probes before optional revalidation. */
export const FACEBOOK_METRIC_DISCOVERY_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** Max posts to pull per Facebook published_posts sync (pagination until cap). */
export const FACEBOOK_PUBLISHED_POSTS_SYNC_CAP = 500;
