import { FUNNEL_DEMO_TITLES } from './funnel-demo-meta';
import { getFunnelDemoSceneOrder } from './funnel-landing-variant';
import { FUNNEL_DEMO_SCENE_COMPONENTS } from './FunnelDemoScenes';

export function getFunnelDemoRegistry() {
  const order = getFunnelDemoSceneOrder();
  return {
    components: order.map((i) => FUNNEL_DEMO_SCENE_COMPONENTS[i]),
    titles: order.map((i) => FUNNEL_DEMO_TITLES[i]),
    count: order.length,
  };
}
