/** Default Graph version for Page objects, posts, messaging (stable). Insights use `metaGraphInsightsBaseUrl`. */
export const FB_REST_API_VERSION = 'v18.0';
export const fbRestBaseUrl = `https://graph.facebook.com/${FB_REST_API_VERSION}`;

export { META_GRAPH_INSIGHTS_VERSION, metaGraphInsightsBaseUrl } from '@/lib/meta-graph-insights';

/** How long to trust cached metric probes before optional revalidation. */
export const FACEBOOK_METRIC_DISCOVERY_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** Max posts to pull per Facebook published_posts sync (pagination until cap). */
export const FACEBOOK_PUBLISHED_POSTS_SYNC_CAP = 500;
