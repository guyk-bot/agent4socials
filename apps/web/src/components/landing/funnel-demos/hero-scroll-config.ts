/** Scroll-driven hero: 8 segments × 100vh scroll room inside 800vh section. */
export const HERO_SCROLL_SECTIONS = 8;
export const HERO_SCROLL_TOTAL_VH = 800;

/**
 * Left / right scene indices per scroll segment.
 * Indices reference FUNNEL_DEMO_SCENE_COMPONENTS.
 */
export const SCROLL_HERO_PANEL_PAIRS = [
  { left: 1, right: 3 }, // Reply / bulk reply · Extract leads
  { left: 4, right: 7 }, // iZop AI · Analytic reports
  { left: 0, right: 2 }, // Schedule · Post analytics
  { left: 8, right: 6 }, // Brainstorm · Team members
  { left: 1, right: 9 }, // Comments · Team performance
  { left: 4, right: 0 }, // iZop AI · Schedule
  { left: 7, right: 3 }, // Reports · Leads
  { left: 8, right: 2 }, // Brainstorm · Analytics
] as const;

export const HERO_PANEL_HEIGHT_PX = 480;
