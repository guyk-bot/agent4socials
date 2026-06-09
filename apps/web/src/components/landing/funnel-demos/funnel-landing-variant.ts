/**
 * Hero side panel carousel configuration.
 *
 * Left column cycles: Comments, iZop AI, Reports, Brainstorm
 * Right column cycles: Leads, Schedule, Team members, Team performance
 *
 * Indices reference FUNNEL_DEMO_SCENE_COMPONENTS / FUNNEL_DEMO_TITLES.
 */

export const FUNNEL_DEMO_ROTATE_MS = 4000;
export const FUNNEL_DEMO_FADE_MS = 500;
export const FUNNEL_DEMO_COLUMN_OFFSET_MS = 2000;

/** Left: panels 1, 3, 5, 7 */
export const LEFT_COLUMN_SCENE_INDICES = [1, 4, 7, 8] as const;

/** Right: panels 2, 4, 6, 8 */
export const RIGHT_COLUMN_SCENE_INDICES = [3, 0, 6, 9] as const;

export const PANELS_PER_COLUMN = 4;

/** Mobile: all 8 panels in display order (panels 1 through 8). */
export const MOBILE_SCENE_INDICES = [1, 3, 4, 0, 7, 6, 8, 9] as const;
