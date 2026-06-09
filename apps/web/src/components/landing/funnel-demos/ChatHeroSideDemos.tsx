'use client';

import React, { useEffect, useRef, useState } from 'react';
import { funnelDemoContentProgress, FunnelDemoFrame } from './FunnelDemoFrame';
import { getFunnelScene } from './funnel-demo-registry';
import {
  FUNNEL_DEMO_COLUMN_OFFSET_MS,
  FUNNEL_DEMO_FADE_MS,
  FUNNEL_DEMO_ROTATE_MS,
  LEFT_COLUMN_SCENE_INDICES,
  MOBILE_SCENE_INDICES,
  RIGHT_COLUMN_SCENE_INDICES,
} from './funnel-landing-variant';

export const FUNNEL_DEMO_MS = FUNNEL_DEMO_ROTATE_MS;

function useSceneProgress(active: boolean, resetKey: number) {
  const [progress, setProgress] = useState(0);
  const rafRef = useRef(0);

  useEffect(() => {
    if (!active) {
      setProgress(0);
      return;
    }
    setProgress(0);
    const start = performance.now();
    const duration = FUNNEL_DEMO_ROTATE_MS - FUNNEL_DEMO_FADE_MS;

    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / duration);
      setProgress(p);
      if (p < 1) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [active, resetKey]);

  return progress;
}

function ProgressDots({ active, count }: { active: number; count: number }) {
  const dotCount = count;
  return (
    <div className="flex justify-center gap-1.5 pt-2" aria-hidden>
      {Array.from({ length: dotCount }, (_, i) => (
        <span
          key={i}
          className={`h-1.5 w-1.5 rounded-full transition-colors duration-300 ${
            i === active ? 'bg-[#AAFF45]' : 'bg-[#2A2A38]'
          }`}
        />
      ))}
    </div>
  );
}

function SideDemoCarousel({
  side,
  sceneIndices,
  startDelayMs,
  panelMinHeight = 380,
}: {
  side: 'left' | 'right';
  sceneIndices: readonly number[];
  startDelayMs: number;
  panelMinHeight?: number;
}) {
  const [slot, setSlot] = useState(0);
  const [opaque, setOpaque] = useState(true);
  const [started, setStarted] = useState(false);
  const timerRef = useRef<number | null>(null);
  const fadeRef = useRef<number | null>(null);

  const sceneIndex = sceneIndices[slot] ?? sceneIndices[0];
  const { Component: Scene, title } = getFunnelScene(sceneIndex);
  const progress = useSceneProgress(opaque && started, slot * 1000 + sceneIndex);
  const contentProgress = funnelDemoContentProgress(progress);

  useEffect(() => {
    const startTimer = window.setTimeout(() => setStarted(true), startDelayMs);

    const scheduleNext = () => {
      timerRef.current = window.setTimeout(() => {
        setOpaque(false);
        fadeRef.current = window.setTimeout(() => {
          setSlot((s) => (s + 1) % sceneIndices.length);
          setOpaque(true);
          scheduleNext();
        }, FUNNEL_DEMO_FADE_MS);
      }, FUNNEL_DEMO_ROTATE_MS);
    };

    const initial = window.setTimeout(scheduleNext, startDelayMs + FUNNEL_DEMO_ROTATE_MS);

    return () => {
      window.clearTimeout(startTimer);
      window.clearTimeout(initial);
      if (timerRef.current) window.clearTimeout(timerRef.current);
      if (fadeRef.current) window.clearTimeout(fadeRef.current);
    };
  }, [sceneIndices, startDelayMs]);

  return (
    <div className="flex h-full min-h-0 w-full flex-col py-3">
      <div
        className={`relative min-h-0 flex-1 transition-opacity duration-500 ${
          opaque ? 'opacity-100' : 'opacity-0'
        }`}
        style={{ minHeight: panelMinHeight }}
      >
        <FunnelDemoFrame visible title={title} progress={progress} entering={opaque}>
          <Scene progress={contentProgress} />
        </FunnelDemoFrame>
      </div>
      <ProgressDots active={slot} count={sceneIndices.length} />
    </div>
  );
}

/** Legacy provider — columns manage their own rotation. */
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
    return <div className="hidden xl:block h-full min-h-0 w-[400px] shrink-0 2xl:w-[440px]" aria-hidden />;
  }

  const sceneIndices = side === 'left' ? LEFT_COLUMN_SCENE_INDICES : RIGHT_COLUMN_SCENE_INDICES;
  const startDelay = side === 'right' ? FUNNEL_DEMO_COLUMN_OFFSET_MS : 0;

  return (
    <div className="hidden xl:flex h-full min-h-0 w-[400px] shrink-0 flex-col funnel-demo-column-enter 2xl:w-[440px]">
      <SideDemoCarousel side={side} sceneIndices={sceneIndices} startDelayMs={startDelay} />
    </div>
  );
}

/** Single-column auto-advance carousel for viewports below xl. */
export function ChatHeroMobileDemoCarousel({ visible = true }: { visible?: boolean }) {
  if (!visible) return null;

  return (
    <div className="xl:hidden w-full px-2 pb-2">
      <SideDemoCarousel
        side="left"
        sceneIndices={MOBILE_SCENE_INDICES}
        startDelayMs={FUNNEL_DEMO_COLUMN_OFFSET_MS}
        panelMinHeight={280}
      />
    </div>
  );
}
