/**
 * Funnel landing layout configuration.
 *
 * Side panel order (4 hero demos only):
 * Left: bulk reply, iZop AI
 * Right: analytic reports, scheduling
 */

/** Scene index order into FUNNEL_DEMO_SCENE_COMPONENTS / TITLES. */
export const FUNNEL_DEMO_SCENE_ORDER = [1, 4, 7, 0] as const;

/** Which column each ordered demo slot appears in. */
export const FUNNEL_DEMO_SLOT_SIDES: ('left' | 'right')[] = [
  'left',
  'left',
  'right',
  'right',
];

export function getFunnelDemoSceneOrder(): readonly number[] {
  return FUNNEL_DEMO_SCENE_ORDER;
}

export function getFunnelDemoSlotSides(): readonly ('left' | 'right')[] {
  return FUNNEL_DEMO_SLOT_SIDES;
}
