/**
 * Candidate metric names to probe for `/{page-id}/insights` with period=day.
 * Order: preferred metrics first. Invalid names are cached per Page so we do not retry every request.
 * Do not add page_engaged_users (deprecated Mar 2024, breaks batch requests when mixed in).
 *
 * Full rationale and UI mapping: docs/FACEBOOK_ANALYTICS_CAPABILITY_MAP.md
 */
/**
 * Order: live JSON–confirmed valid metrics first; (#100) invalid names last so discovery stays fast.
 * Invalid for this app/Page: page_negative_feedback, page_positive_feedback_by_type (and legacy fan/impression names below).
 */
export const FACEBOOK_PAGE_DAY_METRIC_CANDIDATES: string[] = [
  'page_media_view',
  'page_views_total',
  'page_post_engagements',
  'page_video_views',
  'page_video_view_time',
  'page_follows',
  'page_daily_follows',
  'page_total_actions',
  'page_posts_impressions',
  'page_posts_impressions_nonviral',
  'page_posts_impressions_viral',
  // Often (#100) invalid on v22+ for many Pages
  'page_negative_feedback',
  'page_positive_feedback_by_type',
  'page_fan_adds',
  'page_fan_removes',
  'page_impressions',
  'page_cta_clicks_logged_in_total',
];

/**
 * Post-level insights (lifetime totals are common). Probed once per Page using a sample `post_id`.
 */
export const FACEBOOK_POST_LIFETIME_METRIC_CANDIDATES: string[] = [
  'post_media_view',
  'post_impressions',
  'post_impressions_unique',
  'post_video_views',
  'post_video_views_organic',
  'post_video_avg_time_watched',
  'post_engaged_users',
  'post_clicks',
  'post_reactions_like_total',
  'post_reactions_by_type_total',
  'post_comments',
  'post_shares',
];
