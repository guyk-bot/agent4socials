'use client';

import React from 'react';
import { FunnelDemoFrame } from './FunnelDemoFrame';
import { getFunnelScene } from './funnel-demo-registry';
import {
  HERO_PANEL_HEIGHT_PX,
  HERO_SCROLL_SECTIONS,
  SCROLL_HERO_PANEL_PAIRS,
} from './hero-scroll-config';

const PANEL_EASE = 'cubic-bezier(0.4, 0, 0.2, 1)';

function panelLayerStyle(segmentFloat: number, index: number): React.CSSProperties {
  const clamped = Math.min(segmentFloat, HERO_SCROLL_SECTIONS - 1);
  const base = Math.floor(clamped);
  const frac = clamped - base;

  if (base >= HERO_SCROLL_SECTIONS - 1) {
    if (index === HERO_SCROLL_SECTIONS - 1) {
      return { opacity: 1, transform: 'translateY(0)', pointerEvents: 'auto' };
    }
    return { opacity: 0, transform: 'translateY(20px)', pointerEvents: 'none' };
  }

  if (index === base) {
    return {
      opacity: 1 - frac,
      transform: `translateY(${-20 * frac}px)`,
      pointerEvents: frac < 0.5 ? 'auto' : 'none',
    };
  }

  if (index === base + 1) {
    return {
      opacity: frac,
      transform: `translateY(${20 * (1 - frac)}px)`,
      pointerEvents: frac >= 0.5 ? 'auto' : 'none',
    };
  }

  return { opacity: 0, transform: 'translateY(20px)', pointerEvents: 'none' };
}

function ScrollDrivenPanelColumn({
  side,
  segmentFloat,
}: {
  side: 'left' | 'right';
  segmentFloat: number;
}) {
  const sceneIndices = SCROLL_HERO_PANEL_PAIRS.map((pair) =>
    side === 'left' ? pair.left : pair.right
  );

  return (
    <div
      className="relative w-full max-w-[400px] 2xl:max-w-[440px] shrink-0"
      style={{ height: HERO_PANEL_HEIGHT_PX }}
    >
      {sceneIndices.map((sceneIndex, i) => {
        const { Component: Scene, title } = getFunnelScene(sceneIndex);
        const layerStyle = panelLayerStyle(segmentFloat, i);

        return (
          <div
            key={`${side}-${i}-${sceneIndex}`}
            className="absolute inset-0 overflow-hidden will-change-[opacity,transform]"
            style={{
              ...layerStyle,
              transition: `opacity 400ms ${PANEL_EASE}, transform 400ms ${PANEL_EASE}`,
            }}
            aria-hidden={layerStyle.opacity === 0}
          >
            <FunnelDemoFrame visible title={title} progress={1} entering staticMode>
              <Scene progress={1} />
            </FunnelDemoFrame>
          </div>
        );
      })}
    </div>
  );
}

export function HeroScrollProgress({
  segmentFloat,
}: {
  segmentFloat: number;
}) {
  return (
    <div
      className="pointer-events-none fixed left-3 top-1/2 z-40 hidden -translate-y-1/2 flex-col gap-2.5 lg:flex xl:left-4"
      aria-hidden
    >
      {Array.from({ length: HERO_SCROLL_SECTIONS }, (_, i) => {
        const isActive = Math.round(segmentFloat) === i || (segmentFloat >= i && segmentFloat < i + 1);
        return (
          <span
            key={i}
            className="rounded-full transition-all duration-300"
            style={{
              width: isActive ? 8 : 6,
              height: isActive ? 8 : 6,
              background: isActive ? '#AAFF45' : '#2A2A38',
            }}
          />
        );
      })}
    </div>
  );
}

export function HeroScrollHint({ visible }: { visible: boolean }) {
  return (
    <p
      className={`pointer-events-none absolute bottom-3 left-1/2 z-20 -translate-x-1/2 text-center text-xs text-[#888780] transition-opacity duration-500 ${
        visible ? 'opacity-100' : 'opacity-0'
      }`}
      aria-hidden={!visible}
    >
      Scroll to explore ↓
    </p>
  );
}

/** @deprecated Panels are scroll-driven; provider is a passthrough. */
export function ChatHeroDemoLoopProvider({
  children,
}: {
  children: React.ReactNode;
  active?: boolean;
}) {
  return <>{children}</>;
}

export function ChatHeroSideDemoColumn({
  side,
  segmentFloat,
  visible = true,
}: {
  side: 'left' | 'right';
  segmentFloat: number;
  visible?: boolean;
}) {
  if (!visible) {
    return (
      <div
        className="hidden xl:block w-[400px] shrink-0 2xl:w-[440px]"
        style={{ height: HERO_PANEL_HEIGHT_PX }}
        aria-hidden
      />
    );
  }

  return (
    <div className="hidden xl:flex shrink-0 flex-col items-center justify-center funnel-demo-column-enter py-2">
      <ScrollDrivenPanelColumn side={side} segmentFloat={segmentFloat} />
    </div>
  );
}

/** Mobile: single scroll-driven panel (left feature of active pair). */
export function ChatHeroMobileDemoPanel({
  segmentFloat,
  visible = true,
}: {
  segmentFloat: number;
  visible?: boolean;
}) {
  if (!visible) return null;

  return (
    <div className="xl:hidden w-full px-2 pb-2 shrink-0">
      <ScrollDrivenPanelColumn side="left" segmentFloat={segmentFloat} />
    </div>
  );
}
