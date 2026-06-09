import { FUNNEL_DEMO_TITLES } from './funnel-demo-meta';
import { FUNNEL_DEMO_SCENE_COMPONENTS } from './FunnelDemoScenes';

export function getFunnelScene(index: number) {
  const Component = FUNNEL_DEMO_SCENE_COMPONENTS[index];
  const title = FUNNEL_DEMO_TITLES[index];
  if (!Component || !title) {
    throw new Error(`Unknown funnel scene index: ${index}`);
  }
  return { Component, title };
}

/** @deprecated Use getFunnelScene for column carousels. */
export function getFunnelDemoRegistry() {
  const order = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
  return {
    components: order.map((i) => FUNNEL_DEMO_SCENE_COMPONENTS[i]),
    titles: order.map((i) => FUNNEL_DEMO_TITLES[i]),
    count: order.length,
  };
}
