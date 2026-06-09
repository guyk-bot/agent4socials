'use client';

import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { FUNNEL_DEMO_META } from '@/lib/funnel-feature-pages';
import { FunnelDemoFrame } from './FunnelDemoFrame';
import { FUNNEL_DEMO_SCENE_COMPONENTS } from './FunnelDemoScenes';

export const FUNNEL_DEMO_MS = 3000;
const DEMO_COUNT = FUNNEL_DEMO_SCENE_COMPONENTS.length;

const SLOT_SIDE: ('left' | 'right')[] = ['left', 'right', 'left', 'right', 'left', 'right'];
const SLOT_ROW: ('top' | 'middle' | 'bottom')[] = [
  'top',
  'top',
  'middle',
  'middle',
  'bottom',
  'bottom',
];

type SlotPhase = 'hidden' | 'playing' | 'frozen';

type DemoLoopContextValue = {
  phases: SlotPhase[];
  enteredIndex: number | null;
};

const DemoLoopContext = createContext<DemoLoopContextValue | null>(null);

function useSlotProgress(phase: SlotPhase): number {
  const [progress, setProgress] = useState(0);
  const rafRef = useRef(0);

  useEffect(() => {
    if (phase === 'hidden') {
      setProgress(0);
      return;
    }
    if (phase === 'frozen') {
      setProgress(1);
      return;
    }

    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / FUNNEL_DEMO_MS);
      setProgress(p);
      if (p < 1) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [phase]);

  return progress;
}

function DemoSlot({
  index,
  phase,
  justEntered,
}: {
  index: number;
  phase: SlotPhase;
  justEntered: boolean;
}) {
  const progress = useSlotProgress(phase);
  const Scene = FUNNEL_DEMO_SCENE_COMPONENTS[index];
  const visible = phase !== 'hidden';

  const meta = FUNNEL_DEMO_META[index];

  return (
    <FunnelDemoFrame
      visible={visible}
      entering={justEntered && phase === 'playing'}
      title={meta.title}
      learnMoreHref={meta.href}
      showLearnMore={phase === 'frozen'}
    >
      <Scene progress={progress} />
    </FunnelDemoFrame>
  );
}

export function ChatHeroDemoLoopProvider({ children }: { children: React.ReactNode }) {
  const [phases, setPhases] = useState<SlotPhase[]>(() =>
    Array.from({ length: DEMO_COUNT }, () => 'hidden' as SlotPhase)
  );
  const [enteredIndex, setEnteredIndex] = useState<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const clearTimer = () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };

    const startDemo = (index: number) => {
      setEnteredIndex(index);
      setPhases((prev) => {
        const next = [...prev];
        next[index] = 'playing';
        return next;
      });

      timerRef.current = setTimeout(() => {
        setPhases((prev) => {
          const next = [...prev];
          next[index] = 'frozen';
          return next;
        });
        setEnteredIndex(null);

        if (index < DEMO_COUNT - 1) {
          startDemo(index + 1);
        }
        // After the last demo freezes, keep all six visible (no loop reset).
      }, FUNNEL_DEMO_MS);
    };

    startDemo(0);
    return clearTimer;
  }, []);

  return (
    <DemoLoopContext.Provider value={{ phases, enteredIndex }}>
      {children}
    </DemoLoopContext.Provider>
  );
}

export function ChatHeroSideDemoColumn({ side }: { side: 'left' | 'right' }) {
  const ctx = useContext(DemoLoopContext);
  if (!ctx) return null;

  const indices = SLOT_SIDE.map((s, i) => (s === side ? i : -1)).filter((i) => i >= 0);

  return (
    <div
      className={`hidden xl:flex w-[380px] 2xl:w-[420px] shrink-0 flex-col justify-between gap-3 py-3 ${
        side === 'left' ? 'pl-0' : 'pr-0'
      }`}
    >
      {indices.map((index) => {
        const row = SLOT_ROW[index];
        return (
          <div
            key={index}
            className={
              row === 'top' ? 'self-start' : row === 'middle' ? 'self-center' : 'self-end'
            }
          >
            <DemoSlot
              index={index}
              phase={ctx.phases[index]}
              justEntered={ctx.enteredIndex === index}
            />
          </div>
        );
      })}
    </div>
  );
}
