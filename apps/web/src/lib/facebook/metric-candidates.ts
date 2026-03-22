/**
 * Candidate metric names to probe for `/{page-id}/insights` with period=day.
 * Order: preferred metrics first. Invalid names are cached per Page so we do not retry every request.
 * Do not add page_engaged_users (deprecated Mar 2024, breaks batch requests when mixed in).
 *
 * Full rationale and UI mapping: docs/FACEBOOK_ANALYTICS_CAPABILITY_MAP.md
 */
export const FACEBOOK_PAGE_DAY_METRIC_CANDIDATES: string[] = [
  'page_media_view',
  'page_views_total',
  'page_post_engagements',
  'page_fan_adds',
  'page_fan_removes',
  'page_impressions',
  'page_video_views',
  'page_video_view_time',
  'page_follows',
  'page_daily_follows',
  'page_total_actions',
  'page_cta_clicks_logged_in_total',
  'page_negative_feedback',
  'page_positive_feedback_by_type',
  'page_posts_impressions',
  'page_posts_impressions_nonviral',
  'page_posts_impressions_viral',
];

/**
 * Post-level insights (lifetime totals are common). Probed once per Page using a sample `post_id`.
 */
export const FACEBOOK_POST_LIFETIME_METRIC_CANDIDATES: string[] = [
  'post_media_view',
  'post_impressions',
  'post_impressions_unique',
  'post_engaged_users',
  'post_clicks',
  'post_reactions_like_total',
  'post_reactions_by_type_total',
  'post_comments',
  'post_shares',
  'post_video_views',
  'post_video_views_organic',
  'post_video_avg_time_watched',
];
