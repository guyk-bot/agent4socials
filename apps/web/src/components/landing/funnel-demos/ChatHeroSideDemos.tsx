'use client';

import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { funnelDemoContentProgress, FunnelDemoFrame } from './FunnelDemoFrame';
import { getFunnelDemoRegistry } from './funnel-demo-registry';
import { FUNNEL_LANDING_EXPERIMENTAL } from './funnel-landing-variant';

export const FUNNEL_DEMO_MS = 3000;

const FUNNEL_REGISTRY = getFunnelDemoRegistry();
const DEMO_COUNT = FUNNEL_REGISTRY.count;

const SLOT_SIDE: ('left' | 'right')[] = [
  'left',
  'right',
  'left',
  'right',
  'left',
  'right',
  'left',
  'right',
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
  featured = false,
}: {
  index: number;
  phase: SlotPhase;
  justEntered: boolean;
  featured?: boolean;
}) {
  const progress = useSlotProgress(phase);
  const Scene = FUNNEL_REGISTRY.components[index];
  const visible = phase !== 'hidden';

  const contentProgress = funnelDemoContentProgress(progress);

  return (
    <FunnelDemoFrame
      visible={visible}
      entering={justEntered && phase === 'playing'}
      title={FUNNEL_REGISTRY.titles[index]}
      progress={progress}
      featured={featured}
    >
      <Scene progress={contentProgress} />
    </FunnelDemoFrame>
  );
}

export function ChatHeroDemoLoopProvider({
  children,
  active = true,
}: {
  children: React.ReactNode;
  /** When false, side demos stay idle (chat loads first). */
  active?: boolean;
}) {
  const [phases, setPhases] = useState<SlotPhase[]>(() =>
    Array.from({ length: DEMO_COUNT }, () => 'hidden' as SlotPhase)
  );
  const [enteredIndex, setEnteredIndex] = useState<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startedRef = useRef(false);

  useEffect(() => {
    if (!active) return;

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
      }, FUNNEL_DEMO_MS);
    };

    if (!startedRef.current) {
      startedRef.current = true;
      startDemo(0);
    }
    return clearTimer;
  }, [active]);

  return (
    <DemoLoopContext.Provider value={{ phases, enteredIndex }}>
      {children}
    </DemoLoopContext.Provider>
  );
}

function SideDemoScrollColumn({ side }: { side: 'left' | 'right' }) {
  const ctx = useContext(DemoLoopContext);
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [slotHeight, setSlotHeight] = useState(148);

  const indices = SLOT_SIDE.map((s, i) => (s === side ? i : -1)).filter((i) => i >= 0);
  const visibleIndices = ctx ? indices.filter((i) => ctx.phases[i] !== 'hidden') : [];
  const visibleCount = visibleIndices.length;
  const phasesKey = ctx?.phases.join(',') ?? '';

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const measure = () => {
      const gap = 12;
      setSlotHeight(Math.max(136, Math.floor((el.clientHeight - gap) / 2)));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (visibleCount === 0) return;
    const el = scrollRef.current;
    if (!el) return;

    if (visibleCount <= 2) {
      el.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [visibleCount, phasesKey]);

  if (!ctx) return null;

  return (
    <div className="flex h-full min-h-0 w-full flex-col py-3">
      <div
        ref={scrollRef}
        className={`funnel-demo-column-scroll relative min-h-0 flex-1 overflow-y-auto overscroll-y-contain touch-pan-y ${
          side === 'left' ? 'pr-1' : 'pl-1'
        }`}
      >
        {visibleCount > 2 ? (
          <div
            className={`pointer-events-none sticky top-0 z-10 mb-1 h-4 bg-gradient-to-b to-transparent ${
              FUNNEL_LANDING_EXPERIMENTAL ? 'from-[#0A0A0F]' : 'from-[var(--bg-primary)]'
            }`}
            aria-hidden
          />
        ) : null}

        <div className="flex flex-col gap-3">
          {visibleIndices.map((index) => (
            <div key={index} className="shrink-0" style={{ height: slotHeight }}>
              <DemoSlot
                index={index}
                phase={ctx.phases[index]}
                justEntered={ctx.enteredIndex === index}
                featured={FUNNEL_LANDING_EXPERIMENTAL && index < 2}
              />
            </div>
          ))}
          <div ref={bottomRef} className="h-px shrink-0" aria-hidden />
        </div>
      </div>
    </div>
  );
}

export function ChatHeroSideDemoColumn({
  side,
  visible = true,
}: {
  side: 'left' | 'right';
  /** Fade in after chat shell is ready. */
  visible?: boolean;
}) {
  if (!visible) {
    return <div className="hidden xl:block h-full min-h-0 w-[400px] shrink-0 2xl:w-[440px]" aria-hidden />;
  }
  return (
    <div className="hidden xl:flex h-full min-h-0 w-[400px] shrink-0 flex-col funnel-demo-column-enter 2xl:w-[440px]">
      <SideDemoScrollColumn side={side} />
    </div>
  );
}
