'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { FUNNEL_DEMO_META } from './funnel-demo-meta';
import { FunnelDemoFrame } from './FunnelDemoFrame';
import { FUNNEL_DEMO_SCENE_COMPONENTS } from './FunnelDemoScenes';

/** Time each side demo stays visible before advancing the carousel. */
export const FUNNEL_DEMO_MS = 5000;

const LEFT_DEMO_INDICES = [0, 3, 4, 6] as const;
const RIGHT_DEMO_INDICES = [2, 1, 5, 7] as const;

const SLIDE_MS = 700;

type SlideDirection = 'forward' | 'backward';

function StaticDemoCard({ sceneIndex }: { sceneIndex: number }) {
  const Scene = FUNNEL_DEMO_SCENE_COMPONENTS[sceneIndex];
  const { title, Icon } = FUNNEL_DEMO_META[sceneIndex];

  return (
    <FunnelDemoFrame visible title={title} titleIcon={Icon} progress={1} staticMode>
      <Scene progress={1} />
    </FunnelDemoFrame>
  );
}

function slideClasses(
  side: 'left' | 'right',
  role: 'active' | 'exit' | 'hidden',
  direction: SlideDirection
): string {
  const base = 'funnel-demo-carousel-slide absolute inset-x-0 top-0 bottom-0 h-full min-h-0';
  if (role === 'active') return `${base} translate-x-0 opacity-100 z-20`;

  if (role === 'exit') {
    if (side === 'left') {
      return direction === 'forward'
        ? `${base} translate-x-full opacity-0 z-10 pointer-events-none`
        : `${base} -translate-x-full opacity-0 z-10 pointer-events-none`;
    }
    return direction === 'forward'
      ? `${base} -translate-x-full opacity-0 z-10 pointer-events-none`
      : `${base} translate-x-full opacity-0 z-10 pointer-events-none`;
  }

  if (side === 'left') {
    return direction === 'forward'
      ? `${base} -translate-x-full opacity-0 z-0 pointer-events-none`
      : `${base} translate-x-full opacity-0 z-0 pointer-events-none`;
  }
  return direction === 'forward'
    ? `${base} translate-x-full opacity-0 z-0 pointer-events-none`
    : `${base} -translate-x-full opacity-0 z-0 pointer-events-none`;
}

function SideDemoCarouselColumn({ side }: { side: 'left' | 'right' }) {
  const indices = side === 'left' ? LEFT_DEMO_INDICES : RIGHT_DEMO_INDICES;
  const [activeSlot, setActiveSlot] = useState(0);
  const [prevSlot, setPrevSlot] = useState<number | null>(null);
  const [direction, setDirection] = useState<SlideDirection>('forward');
  const [paused, setPaused] = useState(false);

  const goToSlot = useCallback(
    (next: number, dir: SlideDirection) => {
      if (next === activeSlot) return;
      setDirection(dir);
      setPrevSlot(activeSlot);
      setActiveSlot(next);
    },
    [activeSlot]
  );

  const goNext = useCallback(() => {
    goToSlot((activeSlot + 1) % indices.length, 'forward');
  }, [activeSlot, goToSlot, indices.length]);

  const goPrev = useCallback(() => {
    goToSlot((activeSlot - 1 + indices.length) % indices.length, 'backward');
  }, [activeSlot, goToSlot, indices.length]);

  useEffect(() => {
    if (paused) return;
    const id = window.setInterval(goNext, FUNNEL_DEMO_MS);
    return () => window.clearInterval(id);
  }, [paused, goNext]);

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
      <div className="relative min-h-0 flex-1 basis-0 overflow-hidden px-1">
        {indices.map((sceneIndex, i) => {
          const isActive = i === activeSlot;
          const isExit = prevSlot !== null && i === prevSlot && !isActive;
          const role = isActive ? 'active' : isExit ? 'exit' : 'hidden';
          return (
            <div
              key={sceneIndex}
              className={slideClasses(side, role, direction)}
              aria-hidden={!isActive && !isExit}
            >
              <StaticDemoCard sceneIndex={sceneIndex} />
            </div>
          );
        })}

        <button
          type="button"
          onClick={goPrev}
          className="absolute left-0 top-1/2 z-30 -translate-y-1/2 rounded-full border border-neutral-200 bg-white/95 p-1 text-neutral-700 shadow-md hover:bg-white dark:border-neutral-600 dark:bg-neutral-900/95 dark:text-neutral-200"
          aria-label="Previous feature"
        >
          <ChevronLeft size={20} />
        </button>
        <button
          type="button"
          onClick={goNext}
          className="absolute right-0 top-1/2 z-30 -translate-y-1/2 rounded-full border border-neutral-200 bg-white/95 p-1 text-neutral-700 shadow-md hover:bg-white dark:border-neutral-600 dark:bg-neutral-900/95 dark:text-neutral-200"
          aria-label="Next feature"
        >
          <ChevronRight size={20} />
        </button>
      </div>

      <div className="mt-1 flex shrink-0 items-center justify-center gap-1.5 px-2">
        {indices.map((sceneIndex, i) => (
          <button
            key={sceneIndex}
            type="button"
            onClick={() => {
              const len = indices.length;
              const forwardSteps = (i - activeSlot + len) % len;
              const backwardSteps = (activeSlot - i + len) % len;
              goToSlot(i, forwardSteps <= backwardSteps ? 'forward' : 'backward');
            }}
            className={`h-1.5 rounded-full transition-all ${
              i === activeSlot ? 'w-4 bg-[#7C3AED]' : 'w-1.5 bg-neutral-300 dark:bg-neutral-600'
            }`}
            aria-label={`Show demo ${i + 1}`}
          />
        ))}
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
      <div
        className="hidden xl:block h-full min-h-0 w-[var(--funnel-side-w,400px)] shrink-0 2xl:w-[var(--funnel-side-w-2xl,440px)]"
        aria-hidden
      />
    );
  }

  return (
    <div className="hidden xl:flex h-full min-h-0 w-[var(--funnel-side-w,400px)] shrink-0 flex-col 2xl:w-[var(--funnel-side-w-2xl,440px)]">
      <SideDemoCarouselColumn side={side} />
    </div>
  );
}
