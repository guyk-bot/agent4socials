export const FUNNEL_DEMO_POST_VIDEO_SRC = '/funnel-demo-post-video.png';
export const FUNNEL_DEMO_BRAINSTORM_WINNER_SRC = '/funnel-demo-brainstorm-winner.png';

/** Funnel ChatHero AI thinking indicators (theme-specific). */
export const FUNNEL_THINKING_LOGO_DARK_SRC = '/funnel-thinking-dark.png';
export const FUNNEL_THINKING_LOGO_LIGHT_SRC = '/funnel-thinking-light.png';

/** Logo dot lime green (matches izop-z-thinking__dot). */
export const BRAND_LIME_DOT = '#aaff45';

/** Avatar beside funnel ChatHero AI messages (thinking + finished). */
export function funnelAiMessageLogoSrc(theme: 'light' | 'dark'): string {
  return theme === 'dark' ? FUNNEL_THINKING_LOGO_DARK_SRC : FUNNEL_THINKING_LOGO_LIGHT_SRC;
}

/** Funnel analytics demo KPIs (cards + chart must stay in sync). */
export const FUNNEL_ANALYTICS_KPIS = {
  followers: 15_000,
  followersGain: 170,
  views: 20_000,
  engagement: 1_000,
} as const;
