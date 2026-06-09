'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowUp, Check } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useAuthModal } from '@/context/AuthModalContext';
import {
  FacebookIcon,
  InstagramIcon,
  LinkedinIcon,
  PinterestIcon,
  ThreadsIcon,
  TikTokIcon,
  XTwitterIcon,
  YoutubeIcon,
} from '@/components/SocialPlatformIcons';
import { SITE_LOGO_DARK_SRC } from '@/lib/site-brand-assets';
import { setFunnelPostAuthRedirect } from '@/lib/funnel-onboarding';
import { trackChatHeroEvent } from '@/lib/chat-hero-analytics';
import {
  CHAT_HERO_PAIN_POINTS,
  CHAT_HERO_PLATFORMS,
  connectRedirectForPlatforms,
  demoMessageForPainPoint,
  formatPlatformList,
  answerLandingChatQuestion,
  matchPainPointFromText,
  matchPlatformsFromText,
  painDiscoveryMessage,
  type ChatHeroPainPointId,
  type ChatHeroPlatformId,
} from '@/lib/chat-hero-script';
import { FunnelDemoFrame } from '@/components/landing/funnel-demos/FunnelDemoFrame';
import { getFunnelScene } from '@/components/landing/funnel-demos/funnel-demo-registry';

/* ── Layout & rotation ───────────────────────────────────────────── */

const SIDE_PANEL_WIDTH = 300;
const SIDE_PANEL_HEIGHT = 480;
const ROTATE_MS = 6000;
const CROSSFADE_MS = 800;
const RIGHT_COLUMN_DELAY_MS = 3000;

/** Left column: Comments, iZop AI, Reports, Brainstorm */
const LEFT_SCENE_INDICES = [1, 4, 7, 8] as const;
/** Right column: Leads, Schedule, Team, Team performance */
const RIGHT_SCENE_INDICES = [3, 0, 6, 9] as const;

type FlowStep = 0 | 1 | 2 | 3;

type RenderBlock =
  | { id: string; kind: 'ai'; text: string; isOpening?: boolean }
  | { id: string; kind: 'user_pills'; labels: string[] };

const PLATFORM_ICONS: Record<
  ChatHeroPlatformId,
  React.ComponentType<{ size?: number; className?: string }>
> = {
  instagram: InstagramIcon,
  tiktok: TikTokIcon,
  youtube: YoutubeIcon,
  facebook: FacebookIcon,
  x: XTwitterIcon,
  linkedin: LinkedinIcon,
  threads: ThreadsIcon,
  pinterest: PinterestIcon,
};

const OPENING_GREETING = "Hi 👋 I'm iZop,";
const OPENING_HEADLINE = 'your personal AI social media manager.';
const OPENING_BODY =
  "Tell me what platforms you're on, and I'll show you what I can do.";

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function blockId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function useRotatingPanelIndex(length: number, intervalMs: number, startDelayMs: number) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (length <= 1) return;

    let intervalId: number | undefined;
    const startId = window.setTimeout(() => {
      intervalId = window.setInterval(() => {
        setIndex((i) => (i + 1) % length);
      }, intervalMs);
    }, startDelayMs);

    return () => {
      window.clearTimeout(startId);
      if (intervalId) window.clearInterval(intervalId);
    };
  }, [length, intervalMs, startDelayMs]);

  return index;
}

/* ── Sub-components ──────────────────────────────────────────────── */

function AiAvatar() {
  return (
    <span
      className="inline-flex h-8 w-8 shrink-0 items-center justify-center self-start rounded-full bg-black overflow-hidden"
      aria-hidden
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={SITE_LOGO_DARK_SRC} alt="" className="h-[62%] w-[62%] object-contain" loading="eager" />
    </span>
  );
}

function OpeningMessage() {
  return (
    <div className="flex items-start gap-3 chat-hero-message-enter mt-4 sm:mt-6">
      <AiAvatar />
      <div className="min-w-0 flex-1 pt-0.5">
        <p className="chat-hero-opening-greeting">{OPENING_GREETING}</p>
        <p className="chat-hero-opening-headline">{OPENING_HEADLINE}</p>
        <p className="chat-hero-opening-body">{OPENING_BODY}</p>
      </div>
    </div>
  );
}

function AiMessage({ text }: { text: string }) {
  return (
    <div className="flex items-start gap-3 chat-hero-message-enter">
      <AiAvatar />
      <p className="min-w-0 flex-1 pt-0.5 text-base leading-relaxed text-white whitespace-pre-line">{text}</p>
    </div>
  );
}

function SampleConversation() {
  return (
    <div className="mt-5 w-full space-y-4 shrink-0 chat-hero-message-enter">
      <div className="flex justify-end">
        <span className="chat-hero-demo-user-bubble">Which of my posts performed best this week?</span>
      </div>
      <div className="flex items-start gap-3">
        <AiAvatar />
        <p className="min-w-0 flex-1 pt-0.5 text-sm leading-relaxed text-white">
          Your Tuesday Reel got 4.2x your average reach. Short hook + trending audio was the formula.
          Want me to draft a similar post?
        </p>
      </div>
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="flex items-start gap-3 chat-hero-message-enter" aria-label="iZop is typing">
      <AiAvatar />
      <div className="flex items-center gap-1 pt-2">
        <span className="chat-hero-typing-dot h-1.5 w-1.5 rounded-full bg-[#888780]" style={{ animationDelay: '0ms' }} />
        <span className="chat-hero-typing-dot h-1.5 w-1.5 rounded-full bg-[#888780]" style={{ animationDelay: '150ms' }} />
        <span className="chat-hero-typing-dot h-1.5 w-1.5 rounded-full bg-[#888780]" style={{ animationDelay: '300ms' }} />
      </div>
    </div>
  );
}

function PlatformButton({
  label,
  selected,
  disabled,
  icon,
  onClick,
}: {
  label: string;
  selected: boolean;
  disabled?: boolean;
  icon: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={[
        'chat-hero-platform-btn flex w-full items-center gap-2.5 rounded-xl border px-4 py-3 text-left transition-all duration-150 active:scale-[0.98]',
        selected ? 'chat-hero-platform-btn--selected' : '',
        disabled ? 'pointer-events-none opacity-50' : '',
      ].join(' ')}
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center">{icon}</span>
      <span className="text-sm font-medium leading-snug">{label}</span>
    </button>
  );
}

function PainOptionButton({
  label,
  selected,
  disabled,
  onClick,
  staggerIndex,
}: {
  label: string;
  selected: boolean;
  disabled?: boolean;
  onClick: () => void;
  staggerIndex: number;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      style={{ animationDelay: `${staggerIndex * 60}ms` }}
      className={[
        'chat-hero-pill-enter chat-hero-platform-btn flex min-h-[72px] w-full items-center justify-center rounded-xl border px-4 py-3 text-center text-sm font-medium transition-all duration-150',
        selected ? 'chat-hero-platform-btn--selected' : '',
        disabled ? 'pointer-events-none opacity-50' : '',
      ].join(' ')}
    >
      {label}
    </button>
  );
}

function SideFeaturePanel({
  sceneIndices,
  activeIndex,
}: {
  sceneIndices: readonly number[];
  activeIndex: number;
}) {
  return (
    <div
      className="relative overflow-hidden"
      style={{ width: SIDE_PANEL_WIDTH, height: SIDE_PANEL_HEIGHT }}
    >
      {sceneIndices.map((sceneIndex, i) => {
        const { Component: Scene, title } = getFunnelScene(sceneIndex);
        const isActive = activeIndex === i;

        return (
          <div
            key={`${sceneIndex}-${i}`}
            className="absolute inset-0"
            style={{
              opacity: isActive ? 1 : 0,
              pointerEvents: isActive ? 'auto' : 'none',
              transition: `opacity ${CROSSFADE_MS}ms cubic-bezier(0.4, 0, 0.2, 1)`,
            }}
            aria-hidden={!isActive}
          >
            <FunnelDemoFrame visible title={title} progress={1} staticMode>
              <Scene progress={1} />
            </FunnelDemoFrame>
          </div>
        );
      })}

      <div className="absolute bottom-0 left-0 right-0 flex justify-center gap-1.5 pb-1" aria-hidden>
        {sceneIndices.map((_, i) => (
          <span
            key={i}
            className={`rounded-full transition-colors duration-300 ${
              i === activeIndex ? 'h-2 w-2 bg-[#AAFF45]' : 'h-1.5 w-1.5 bg-[#2A2A38]'
            }`}
          />
        ))}
      </div>
    </div>
  );
}

function SideFeatureColumn({
  sceneIndices,
  startDelayMs,
  className,
}: {
  sceneIndices: readonly number[];
  startDelayMs: number;
  className?: string;
}) {
  const activeIndex = useRotatingPanelIndex(sceneIndices.length, ROTATE_MS, startDelayMs);

  return (
    <aside className={className}>
      <SideFeaturePanel sceneIndices={sceneIndices} activeIndex={activeIndex} />
    </aside>
  );
}

/* ── Main hero ─────────────────────────────────────────────────── */

export default function ChatHero() {
  const { signInWithGoogle } = useAuth();
  const { openSignup } = useAuthModal();

  const [step, setStep] = useState<FlowStep>(0);
  const [blocks, setBlocks] = useState<RenderBlock[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const [busy, setBusy] = useState(false);

  const [selectedPlatforms, setSelectedPlatforms] = useState<ChatHeroPlatformId[]>([]);
  const [selectedPain, setSelectedPain] = useState<ChatHeroPainPointId | null>(null);

  const [showPlatformOptions, setShowPlatformOptions] = useState(true);
  const [showPainOptions, setShowPainOptions] = useState(false);
  const [showDemoCta, setShowDemoCta] = useState(false);
  const [showSignup, setShowSignup] = useState(false);

  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState('');
  const [draftText, setDraftText] = useState('');

  const scrollRef = useRef<HTMLDivElement>(null);
  const flowLock = useRef(false);

  const platformLabels = useMemo(
    () =>
      selectedPlatforms
        .map((id) => CHAT_HERO_PLATFORMS.find((p) => p.id === id)?.label)
        .filter((l): l is string => Boolean(l)),
    [selectedPlatforms]
  );

  const scrollToLatest = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    requestAnimationFrame(() => {
      el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    });
  }, []);

  const appendBlocks = useCallback(
    (next: RenderBlock[]) => {
      setBlocks((prev) => [...prev, ...next]);
      scrollToLatest();
    },
    [scrollToLatest]
  );

  const playTypingThen = useCallback(
    async (ms: number, fn: () => void | Promise<void>) => {
      setIsTyping(true);
      scrollToLatest();
      await delay(ms);
      setIsTyping(false);
      await fn();
      scrollToLatest();
    },
    [scrollToLatest]
  );

  useEffect(() => {
    trackChatHeroEvent('chat_started');
    setBlocks([{ id: blockId('ai'), kind: 'ai', text: '', isOpening: true }]);
  }, []);

  const togglePlatform = useCallback((id: ChatHeroPlatformId) => {
    setSelectedPlatforms((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
    );
  }, []);

  const handlePlatformsContinue = useCallback(async () => {
    if (busy || flowLock.current || selectedPlatforms.length === 0) return;
    flowLock.current = true;
    setBusy(true);
    setShowPlatformOptions(false);
    trackChatHeroEvent('platforms_selected', { platforms: selectedPlatforms });
    appendBlocks([{ id: blockId('user'), kind: 'user_pills', labels: platformLabels }]);
    setStep(1);
    await playTypingThen(800, async () => {
      appendBlocks([{ id: blockId('ai'), kind: 'ai', text: painDiscoveryMessage(platformLabels) }]);
      await delay(400);
      setShowPainOptions(true);
      setBusy(false);
      flowLock.current = false;
    });
  }, [appendBlocks, busy, platformLabels, playTypingThen, selectedPlatforms]);

  const handlePainContinue = useCallback(async () => {
    if (busy || flowLock.current || !selectedPain) return;
    flowLock.current = true;
    setBusy(true);
    setShowPainOptions(false);
    const painLabel = CHAT_HERO_PAIN_POINTS.find((p) => p.id === selectedPain)?.label ?? '';
    trackChatHeroEvent('pain_point_selected', { pain_point: selectedPain });
    appendBlocks([{ id: blockId('user'), kind: 'user_pills', labels: [painLabel] }]);
    setStep(2);
    await playTypingThen(800, async () => {
      appendBlocks([{ id: blockId('ai'), kind: 'ai', text: demoMessageForPainPoint(selectedPain) }]);
      trackChatHeroEvent('demo_completed', { pain_point: selectedPain });
      await delay(400);
      await playTypingThen(800, async () => {
        appendBlocks([
          { id: blockId('ai'), kind: 'ai', text: 'Want to see this working on your actual accounts?' },
        ]);
        setShowDemoCta(true);
        setBusy(false);
        flowLock.current = false;
      });
    });
  }, [appendBlocks, busy, playTypingThen, selectedPain]);

  const handleStartForFree = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setShowDemoCta(false);
    trackChatHeroEvent('signup_clicked', { platforms: selectedPlatforms });
    setStep(3);
    await playTypingThen(800, async () => {
      appendBlocks([
        {
          id: blockId('ai'),
          kind: 'ai',
          text: `Create your free account and I'll connect to your ${formatPlatformList(platformLabels)} right away.`,
        },
      ]);
      setShowSignup(true);
      setBusy(false);
    });
  }, [appendBlocks, busy, platformLabels, playTypingThen, selectedPlatforms]);

  const handleGoogleSignup = useCallback(async () => {
    setAuthError('');
    setAuthLoading(true);
    try {
      setFunnelPostAuthRedirect(connectRedirectForPlatforms(selectedPlatforms));
      await signInWithGoogle();
    } catch (err: unknown) {
      setAuthError(
        err && typeof err === 'object' && 'message' in err
          ? String((err as { message: string }).message)
          : 'Failed to sign in with Google'
      );
      setAuthLoading(false);
    }
  }, [selectedPlatforms, signInWithGoogle]);

  const handleEmailSignup = useCallback(() => {
    setFunnelPostAuthRedirect(connectRedirectForPlatforms(selectedPlatforms));
    openSignup();
  }, [openSignup, selectedPlatforms]);

  const handleFreeTextSubmit = useCallback(async () => {
    const trimmed = draftText.trim();
    if (!trimmed || busy || isTyping) return;
    if (step === 0 && /^(hi|hello|hey|yo)\b/i.test(trimmed)) {
      setDraftText('');
      return;
    }
    setDraftText('');
    const matchedPlatforms = matchPlatformsFromText(trimmed);
    const matchedPain = matchPainPointFromText(trimmed);
    if (showPlatformOptions && matchedPlatforms.length > 0) {
      setSelectedPlatforms((prev) => [...new Set([...prev, ...matchedPlatforms])]);
    }
    if (showPainOptions && matchedPain) setSelectedPain(matchedPain);
    const isPlatformOnly =
      step === 0 && showPlatformOptions && matchedPlatforms.length > 0 && trimmed.split(/\s+/).length <= 3;
    if (!isPlatformOnly) {
      appendBlocks([{ id: blockId('user'), kind: 'user_pills', labels: [trimmed] }]);
    }
    setBusy(true);
    await playTypingThen(800, async () => {
      appendBlocks([
        {
          id: blockId('ai'),
          kind: 'ai',
          text: answerLandingChatQuestion({
            step,
            text: trimmed,
            matchedPlatforms,
            matchedPain,
            selectedPlatformIds: [...new Set([...selectedPlatforms, ...matchedPlatforms])],
          }),
        },
      ]);
      setBusy(false);
    });
  }, [
    appendBlocks,
    busy,
    draftText,
    isTyping,
    playTypingThen,
    selectedPlatforms,
    showPainOptions,
    showPlatformOptions,
    step,
  ]);

  const inputPlaceholder = useMemo(() => {
    if (showSignup) return 'Ask anything, or use the signup buttons below…';
    if (showDemoCta) return 'Type a question, or tap Start for free…';
    if (showPainOptions) return 'Describe your biggest challenge…';
    if (step === 0 && !showPainOptions && !showDemoCta && !showSignup) {
      return "Try: 'Reply to all my Instagram comments from today'";
    }
    return 'Message iZop…';
  }, [showDemoCta, showPainOptions, showSignup, step]);

  const canPlatformContinue = selectedPlatforms.length > 0 && !busy;
  const canPainContinue = selectedPain !== null && !busy;

  return (
    <section className="chat-hero flex h-[100dvh] max-h-[100dvh] flex-col overflow-hidden bg-[#0A0A0F] pt-[calc(3px+3.5rem)] sm:pt-[calc(3px+4rem)]">
      <div className="mx-auto flex min-h-0 w-full max-w-[1280px] flex-1 items-center gap-4 px-3 py-3 sm:px-4 lg:px-6">
        <SideFeatureColumn
          sceneIndices={LEFT_SCENE_INDICES}
          startDelayMs={0}
          className="hidden shrink-0 xl:block"
        />

        <div className="chat-hero__main flex min-h-0 min-w-0 flex-1 flex-col">
          <h1 className="sr-only">iZop, your personal AI social media manager</h1>

          <div
            ref={scrollRef}
            className="flex min-h-0 flex-1 flex-col overflow-y-auto px-1 sm:px-2"
          >
            <div className="w-full shrink-0 space-y-3">
              {blocks.map((block) => {
                if (block.kind === 'ai') {
                  if (block.isOpening) return <OpeningMessage key={block.id} />;
                  return <AiMessage key={block.id} text={block.text} />;
                }
                return (
                  <div key={block.id} className="chat-hero-message-enter flex flex-wrap justify-end gap-2">
                    {block.labels.map((label) => (
                      <span key={label} className="chat-hero-user-pill">
                        {label}
                      </span>
                    ))}
                  </div>
                );
              })}
              {isTyping ? <TypingIndicator /> : null}
            </div>

            {showPlatformOptions ? (
              <div className="mt-4 w-full shrink-0">
                <div className="grid w-full grid-cols-2 gap-2.5 md:grid-cols-4 sm:gap-3">
                  {CHAT_HERO_PLATFORMS.map((platform) => {
                    const Icon = PLATFORM_ICONS[platform.id];
                    const selected = selectedPlatforms.includes(platform.id);
                    return (
                      <PlatformButton
                        key={platform.id}
                        label={platform.label}
                        selected={selected}
                        disabled={busy}
                        icon={<Icon size={24} />}
                        onClick={() => togglePlatform(platform.id)}
                      />
                    );
                  })}
                </div>
                <SampleConversation />
              </div>
            ) : null}

            {showPainOptions ? (
              <div className="mt-4 grid w-full shrink-0 grid-cols-1 gap-2 sm:grid-cols-2 sm:gap-2.5 lg:grid-cols-3">
                {CHAT_HERO_PAIN_POINTS.map((pain, i) => (
                  <PainOptionButton
                    key={pain.id}
                    label={pain.label}
                    selected={selectedPain === pain.id}
                    disabled={busy}
                    staggerIndex={i}
                    onClick={() => setSelectedPain(pain.id)}
                  />
                ))}
              </div>
            ) : null}
          </div>

          <div className="shrink-0 px-1 pb-2 pt-3 sm:px-2">
            <div className="space-y-3">
              {showPlatformOptions && canPlatformContinue ? (
                <button
                  type="button"
                  onClick={() => void handlePlatformsContinue()}
                  className="chat-hero-continue-btn chat-hero-continue-enter"
                >
                  Continue →
                </button>
              ) : null}
              {showPainOptions && canPainContinue ? (
                <button
                  type="button"
                  onClick={() => void handlePainContinue()}
                  className="chat-hero-continue-btn chat-hero-continue-enter"
                >
                  Show me →
                </button>
              ) : null}
              {showDemoCta ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void handleStartForFree()}
                  className="chat-hero-continue-btn chat-hero-continue-enter"
                >
                  Start for free — no credit card →
                </button>
              ) : null}
              {showSignup ? (
                <div className="chat-hero-continue-enter space-y-3">
                  {authError ? <p className="text-sm text-red-400">{authError}</p> : null}
                  <button
                    type="button"
                    disabled={authLoading}
                    onClick={() => void handleGoogleSignup()}
                    className="btn-google-lime flex w-full items-center justify-center gap-3 rounded-full px-7 py-3 text-[15px] font-semibold disabled:cursor-not-allowed"
                  >
                    {authLoading ? 'Redirecting…' : 'Continue with Google'}
                  </button>
                  <button
                    type="button"
                    onClick={handleEmailSignup}
                    className="w-full rounded-full border border-[#1E1E2A] bg-[#111118] px-7 py-3 text-[15px] font-medium text-[#888780] transition-all hover:border-[#7C3AED] hover:text-white"
                  >
                    Continue with email
                  </button>
                  <p className="text-center text-xs text-[#888780]">
                    Free forever plan available · No credit card required
                  </p>
                </div>
              ) : null}
            </div>

            <form
              className="chat-hero-input-form mt-3 flex w-full items-center gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                void handleFreeTextSubmit();
              }}
            >
              <input
                type="text"
                value={draftText}
                onChange={(e) => setDraftText(e.target.value)}
                placeholder={inputPlaceholder}
                disabled={busy || isTyping}
                className="min-w-0 flex-1 bg-transparent text-[15px] text-white outline-none placeholder:text-[#888780] disabled:opacity-50"
                aria-label="Message iZop"
              />
              <button
                type="submit"
                disabled={!draftText.trim() || busy || isTyping}
                className="chat-hero-send-btn flex h-9 w-9 shrink-0 items-center justify-center disabled:pointer-events-none disabled:opacity-40"
                aria-label="Send message"
              >
                <ArrowUp className="h-4 w-4 text-white" />
              </button>
            </form>

            <div className="chat-hero-trust-signals">
              <span className="chat-hero-trust-item">
                <Check className="chat-hero-trust-check h-3.5 w-3.5" />
                No credit card required
              </span>
              <span className="chat-hero-trust-item">
                <Check className="chat-hero-trust-check h-3.5 w-3.5" />
                Free plan forever
              </span>
              <span className="chat-hero-trust-item">
                <Check className="chat-hero-trust-check h-3.5 w-3.5" />
                Cancel anytime
              </span>
            </div>
          </div>

          <div className="xl:hidden flex shrink-0 justify-center px-2 pb-2">
            <SideFeatureColumn sceneIndices={LEFT_SCENE_INDICES} startDelayMs={RIGHT_COLUMN_DELAY_MS} />
          </div>
        </div>

        <SideFeatureColumn
          sceneIndices={RIGHT_SCENE_INDICES}
          startDelayMs={RIGHT_COLUMN_DELAY_MS}
          className="hidden shrink-0 xl:block"
        />
      </div>
    </section>
  );
}
