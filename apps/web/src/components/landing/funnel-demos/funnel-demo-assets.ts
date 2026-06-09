export const FUNNEL_DEMO_POST_VIDEO_SRC = '/funnel-demo-post-video.png';
export const FUNNEL_DEMO_PROFILE_AVATAR_SRC = '/funnel-demo-profile-avatar.png';
export const FUNNEL_DEMO_BRAINSTORM_WINNER_SRC = '/funnel-demo-brainstorm-winner.png';
export const FUNNEL_DEMO_PARKOUR_POST_SRC = '/funnel-demo-parkour-post.png';
export const FUNNEL_DEMO_BEST_POST_WEEK_SRC = '/funnel-demo-best-post-week.png';

/** Portrait posts for Instagram weekly analytics demo (3:4). */
export const FUNNEL_DEMO_IG_WEEK_POSTS = [
  { src: '/funnel-demo-ig-week-1.png', label: 'Does your content shine?', views: '11K', likes: '720', format: 'reel' as const },
  { src: '/funnel-demo-ig-week-2.png', label: '5 things every creator must have', views: '9.2K', likes: '640', format: 'reel' as const },
  { src: '/funnel-demo-ig-week-4.png', label: 'Future tech unboxing', views: '8.1K', likes: '510', format: 'image' as const },
  { src: '/funnel-demo-ig-week-5.png', label: 'Studio gear review', views: '7.4K', likes: '460', format: 'carousel' as const },
  { src: '/funnel-demo-ig-week-3.png', label: 'Best app for creators', views: '6.8K', likes: '420', format: 'reel' as const },
  { src: '/funnel-demo-ig-week-6.png', label: 'Office day workflow', views: '5.2K', likes: '310', format: 'image' as const },
] as const;

/** Funnel title bar + opening headline lime. */
export const BRAND_LIME_DOT = '#c1ff72';

/** Funnel analytics demo KPIs (cards + chart must stay in sync). */
export const FUNNEL_ANALYTICS_KPIS = {
  followers: 14_847,
  followersGain: 135,
  views: 12_840,
  engagement: 712,
} as const;
