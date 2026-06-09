'use client';

import React, { useEffect, useState } from 'react';
import { FUNNEL_DEMO_TITLES } from './funnel-demo-meta';
import { FunnelDemoFrame } from './FunnelDemoFrame';
import { FUNNEL_DEMO_SCENE_COMPONENTS } from './FunnelDemoScenes';

/** Time each side demo stays visible before advancing the carousel. */
export const FUNNEL_DEMO_MS = 5000;

const LEFT_DEMO_INDICES = [0, 2, 4, 6] as const;
const RIGHT_DEMO_INDICES = [1, 3, 5, 7] as const;

const SLIDE_MS = 700;

function StaticDemoCard({ sceneIndex }: { sceneIndex: number }) {
  const Scene = FUNNEL_DEMO_SCENE_COMPONENTS[sceneIndex];
  const title = FUNNEL_DEMO_TITLES[sceneIndex];

  return (
    <FunnelDemoFrame visible title={title} progress={1} staticMode>
      <Scene progress={1} />
    </FunnelDemoFrame>
  );
}

function slideClasses(side: 'left' | 'right', role: 'active' | 'exit' | 'hidden'): string {
  const base = 'funnel-demo-carousel-slide absolute inset-x-0 top-0 bottom-0';
  if (role === 'active') return `${base} translate-x-0 opacity-100 z-20`;
  if (role === 'exit') {
    return side === 'left'
      ? `${base} translate-x-full opacity-0 z-10 pointer-events-none`
      : `${base} -translate-x-full opacity-0 z-10 pointer-events-none`;
  }
  return side === 'left'
    ? `${base} -translate-x-full opacity-0 z-0 pointer-events-none`
    : `${base} translate-x-full opacity-0 z-0 pointer-events-none`;
}

function SideDemoCarouselColumn({ side }: { side: 'left' | 'right' }) {
  const indices = side === 'left' ? LEFT_DEMO_INDICES : RIGHT_DEMO_INDICES;
  const [activeSlot, setActiveSlot] = useState(0);
  const [prevSlot, setPrevSlot] = useState<number | null>(null);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused) return;
    const id = window.setInterval(() => {
      setActiveSlot((current) => {
        setPrevSlot(current);
        return (current + 1) % indices.length;
      });
    }, FUNNEL_DEMO_MS);
    return () => window.clearInterval(id);
  }, [paused, indices.length]);

  useEffect(() => {
    if (prevSlot === null) return;
    const id = window.setTimeout(() => setPrevSlot(null), SLIDE_MS);
    return () => window.clearTimeout(id);
  }, [prevSlot, activeSlot]);

  return (
    <div
      className="relative flex h-full min-h-0 w-full flex-col py-3"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div className="relative min-h-0 flex-1 overflow-hidden">
        {indices.map((sceneIndex, i) => {
          const isActive = i === activeSlot;
          const isExit = prevSlot !== null && i === prevSlot && !isActive;
          const role = isActive ? 'active' : isExit ? 'exit' : 'hidden';
          return (
            <div key={sceneIndex} className={slideClasses(side, role)} aria-hidden={!isActive && !isExit}>
              <StaticDemoCard sceneIndex={sceneIndex} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

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
  visible = true,
}: {
  side: 'left' | 'right';
  visible?: boolean;
}) {
  if (!visible) {
    return (
      <div className="hidden xl:block h-full min-h-0 w-[400px] shrink-0 2xl:w-[440px]" aria-hidden />
    );
  }

  return (
    <div className="hidden xl:flex h-full min-h-0 w-[400px] shrink-0 flex-col 2xl:w-[440px]">
      <SideDemoCarouselColumn side={side} />
    </div>
  );
}
