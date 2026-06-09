'use client';

import React, { useEffect, useRef, useState } from 'react';
import { FUNNEL_DEMO_TITLES } from './funnel-demo-meta';
import { FunnelDemoFrame } from './FunnelDemoFrame';
import { FUNNEL_DEMO_SCENE_COMPONENTS } from './FunnelDemoScenes';

/** Time each side demo stays visible before scrolling to the next. */
export const FUNNEL_DEMO_MS = 5000;

const LEFT_DEMO_INDICES = [0, 2, 4, 6] as const;
const RIGHT_DEMO_INDICES = [1, 3, 5, 7] as const;

const SLOT_GAP_PX = 12;

function StaticDemoCard({ sceneIndex }: { sceneIndex: number }) {
  const Scene = FUNNEL_DEMO_SCENE_COMPONENTS[sceneIndex];
  const title = FUNNEL_DEMO_TITLES[sceneIndex];

  return (
    <FunnelDemoFrame visible title={title} progress={1} staticMode>
      <Scene progress={1} />
    </FunnelDemoFrame>
  );
}

function SideDemoScrollColumn({ side }: { side: 'left' | 'right' }) {
  const indices = side === 'left' ? LEFT_DEMO_INDICES : RIGHT_DEMO_INDICES;
  const scrollRef = useRef<HTMLDivElement>(null);
  const [activeSlot, setActiveSlot] = useState(0);
  const [slotHeight, setSlotHeight] = useState(320);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const measure = () => {
      setSlotHeight(Math.max(280, el.clientHeight));
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => {
      setActiveSlot((s) => (s + 1) % indices.length);
    }, FUNNEL_DEMO_MS);

    return () => window.clearInterval(id);
  }, [indices.length]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const top = activeSlot * (slotHeight + SLOT_GAP_PX);
    el.scrollTo({ top, behavior: 'smooth' });
  }, [activeSlot, slotHeight]);

  return (
    <div className="flex h-full min-h-0 w-full flex-col py-3">
      <div
        ref={scrollRef}
        className={`funnel-demo-column-scroll relative min-h-0 flex-1 overflow-y-auto overscroll-y-contain touch-pan-y scroll-smooth ${
          side === 'left' ? 'pr-1' : 'pl-1'
        }`}
        style={{ scrollSnapType: 'y mandatory' }}
      >
        <div className="flex flex-col" style={{ gap: SLOT_GAP_PX }}>
          {indices.map((sceneIndex) => (
            <div
              key={sceneIndex}
              className="shrink-0"
              style={{ height: slotHeight, scrollSnapAlign: 'start' }}
            >
              <StaticDemoCard sceneIndex={sceneIndex} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Side columns manage their own 5s scroll; provider is a passthrough. */
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
      <SideDemoScrollColumn side={side} />
    </div>
  );
}
