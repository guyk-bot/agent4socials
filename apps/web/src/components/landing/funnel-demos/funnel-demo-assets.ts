export const FUNNEL_DEMO_POST_VIDEO_SRC = '/funnel-demo-post-video.png';
export const FUNNEL_DEMO_PROFILE_AVATAR_SRC = '/funnel-demo-profile-avatar.png';
export const FUNNEL_DEMO_BRAINSTORM_WINNER_SRC = '/funnel-demo-brainstorm-winner.png';
export const FUNNEL_DEMO_PARKOUR_POST_SRC = '/funnel-demo-parkour-post.png';

/** Portrait posts for Instagram weekly analytics demo (3:4). */
export const FUNNEL_DEMO_IG_WEEK_POSTS = [
  { src: '/funnel-demo-post-video.png', label: 'Precision line at sunrise', views: '89K', likes: '4.2K' },
  { src: '/funnel-demo-ig-week-1.png', label: 'Does your content shine?', views: '42K', likes: '2.8K' },
  { src: '/funnel-demo-ig-week-2.png', label: '5 things every creator must have', views: '31K', likes: '1.9K' },
  { src: '/funnel-demo-ig-week-4.png', label: 'Future tech unboxing', views: '28K', likes: '1.6K' },
  { src: '/funnel-demo-ig-week-5.png', label: 'Studio gear review', views: '24K', likes: '1.4K' },
  { src: '/funnel-demo-ig-week-3.png', label: 'Best app for creators', views: '19K', likes: '1.1K' },
  { src: '/funnel-demo-ig-week-6.png', label: 'Office day workflow', views: '15K', likes: '890' },
] as const;

/** Funnel title bar + opening headline lime. */
export const BRAND_LIME_DOT = '#c1ff72';

/** Funnel analytics demo KPIs (cards + chart must stay in sync). */
export const FUNNEL_ANALYTICS_KPIS = {
  followers: 14_847,
  followersGain: 135,
  views: 18_432,
  engagement: 937,
} as const;
