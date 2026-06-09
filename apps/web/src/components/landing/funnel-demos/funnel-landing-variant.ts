/**
 * Experimental funnel landing UI (dark side panels, hero hierarchy, lime nav CTA).
 *
 * Revert to classic lime panels anytime:
 * 1. Set `FUNNEL_LANDING_EXPERIMENTAL` to `false` below, or
 * 2. Set env `NEXT_PUBLIC_FUNNEL_LANDING_VARIANT=classic`
 *
 * Force experimental: `NEXT_PUBLIC_FUNNEL_LANDING_VARIANT=experimental`
 */

const envVariant = process.env.NEXT_PUBLIC_FUNNEL_LANDING_VARIANT;

/** Primary switch — flip to `false` to restore classic without env changes. */
export const FUNNEL_LANDING_EXPERIMENTAL =
  envVariant === 'classic' ? false : envVariant === 'experimental' ? true : true;

export const FUNNEL_EXPERIMENTAL_COLORS = {
  void: '#0A0A0F',
  surface: '#111118',
  border: '#1E1E2A',
  lime: '#AAFF45',
  muted: '#888780',
} as const;

/** Scene index order (into FUNNEL_DEMO_SCENE_COMPONENTS / TITLES). */
export const FUNNEL_DEMO_CLASSIC_SCENE_ORDER = [0, 1, 2, 3, 4, 5, 6, 7] as const;

/** Killer features first: comments, leads, schedule, analytics, then rest. */
export const FUNNEL_DEMO_EXPERIMENTAL_SCENE_ORDER = [1, 3, 0, 2, 4, 5, 6, 7] as const;

export function getFunnelDemoSceneOrder(): readonly number[] {
  return FUNNEL_LANDING_EXPERIMENTAL
    ? FUNNEL_DEMO_EXPERIMENTAL_SCENE_ORDER
    : FUNNEL_DEMO_CLASSIC_SCENE_ORDER;
}
