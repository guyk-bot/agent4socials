export const FUNNEL_DEMO_POST_VIDEO_SRC = '/funnel-demo-post-video.png';
export const FUNNEL_DEMO_PROFILE_AVATAR_SRC = '/funnel-demo-profile-avatar.png';
export const FUNNEL_DEMO_BRAINSTORM_WINNER_SRC = '/funnel-demo-brainstorm-winner.png';
export const FUNNEL_DEMO_PARKOUR_POST_SRC = '/funnel-demo-parkour-post.png';
export const FUNNEL_DEMO_BEST_POST_WEEK_SRC = '/funnel-demo-best-post-week.png';

/** Realistic demo profile photos for leads, comments, and team (not post thumbnails). */
export const FUNNEL_DEMO_PEOPLE_AVATARS = {
  sarah: '/funnel-demo-avatar-sarah-chen.jpg',
  priya: '/funnel-demo-avatar-priya-sharma.jpg',
  mike: '/funnel-demo-avatar-mike-torres.jpg',
  daniel: '/funnel-demo-avatar-daniel-frost.jpg',
  james: '/funnel-demo-avatar-james-okonkwo.jpg',
  alex: '/funnel-demo-avatar-alex-kim.jpg',
  maya: '/funnel-demo-avatar-maya-rodriguez.jpg',
  lina: '/funnel-demo-avatar-lina-park.jpg',
  chris: '/funnel-demo-avatar-chris-webb.jpg',
  emma: '/funnel-demo-avatar-emma-walsh.jpg',
  noah: '/funnel-demo-avatar-noah-patel.jpg',
  zoe: '/funnel-demo-avatar-zoe-martin.jpg',
  guy: '/funnel-demo-avatar-guy-kogen.jpg',
  nina: '/funnel-demo-avatar-nina-cho.jpg',
  omar: '/funnel-demo-avatar-omar-hassan.jpg',
  julia: '/funnel-demo-avatar-julia-ross.jpg',
} as const;

/** @deprecated use FUNNEL_DEMO_PEOPLE_AVATARS */
export const FUNNEL_DEMO_AVATARS = FUNNEL_DEMO_PEOPLE_AVATARS;

/** Top-performing ad creatives for compare-ads chart. */
export const FUNNEL_DEMO_TOP_ADS = [
  { src: '/funnel-demo-ad-task-complete.png', label: 'Task Complete', roas: 4.82, cpa: '$8.40', isVideo: true },
  { src: '/funnel-demo-ad-unlock-insights.png', label: 'Unlock Insights', roas: 4.31, cpa: '$9.10', isVideo: false },
  { src: '/funnel-demo-ad-automate.png', label: 'Automate', roas: 3.94, cpa: '$10.20', isVideo: true },
  { src: '/funnel-demo-ad-security.png', label: 'Security Core', roas: 3.58, cpa: '$11.05', isVideo: false },
  { src: '/funnel-demo-ad-accessible.png', label: 'Accessible', roas: 3.21, cpa: '$12.80', isVideo: true },
] as const;

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
