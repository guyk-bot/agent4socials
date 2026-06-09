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
  ChatHeroDemoLoopProvider,
  ChatHeroMobileDemoPanel,
  ChatHeroSideDemoColumn,
  HeroScrollHint,
  HeroScrollProgress,
} from '@/components/landing/funnel-demos/ChatHeroSideDemos';
import { HERO_SCROLL_TOTAL_VH } from '@/components/landing/funnel-demos/hero-scroll-config';
import { useHeroScrollProgress } from '@/components/landing/funnel-demos/useHeroScrollProgress';
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

const MOBILE_FEATURE_CHIPS = [
  { emoji: '🤖', label: 'Bulk replies' },
  { emoji: '📊', label: 'Analytics' },
  { emoji: '📋', label: 'Lead extraction' },
  { emoji: '📅', label: 'Scheduling' },
] as const;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function blockId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

const FUNNEL_AI_AVATAR_BOX = 'h-8 w-8 shrink-0';

function FunnelAiMessageAvatar({ className }: { className?: string }) {
  const boxClass = className ?? FUNNEL_AI_AVATAR_BOX;
  return (
    <span
      className={`inline-flex items-center justify-center self-start rounded-full bg-black overflow-hidden ${boxClass}`}
      aria-hidden
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={SITE_LOGO_DARK_SRC}
        alt=""
        className="h-[62%] w-[62%] object-contain"
        loading="eager"
      />
    </span>
  );
}

function TypingIndicator() {
  return (
    <div className="flex items-start gap-3 chat-hero-message-enter" aria-label="iZop is typing">
      <FunnelAiMessageAvatar />
      <div className="flex items-center gap-1 pt-2">
        <span className="chat-hero-typing-dot h-1.5 w-1.5 rounded-full bg-[var(--chat-hero-muted)]" style={{ animationDelay: '0ms' }} />
        <span className="chat-hero-typing-dot h-1.5 w-1.5 rounded-full bg-[var(--chat-hero-muted)]" style={{ animationDelay: '150ms' }} />
        <span className="chat-hero-typing-dot h-1.5 w-1.5 rounded-full bg-[var(--chat-hero-muted)]" style={{ animationDelay: '300ms' }} />
      </div>
    </div>
  );
}

function OpeningMessage() {
  return (
    <div className="flex items-start gap-3 chat-hero-message-enter mt-5 sm:mt-7">
      <FunnelAiMessageAvatar />
      <div className="flex-1 min-w-0 pt-0.5">
        <p className="chat-hero-opening-greeting">{OPENING_GREETING}</p>
        <p className="chat-hero-opening-headline">{OPENING_HEADLINE}</p>
        <p className="chat-hero-opening-body">{OPENING_BODY}</p>
      </div>
    </div>
  );
}

function SampleConversation() {
  return (
    <div className="mt-5 w-full space-y-4 shrink-0 chat-hero-message-enter">
      <div className="flex justify-end">
        <span className="chat-hero-demo-user-bubble">
          Which of my posts performed best this week?
        </span>
      </div>
      <div className="flex items-start gap-3">
        <FunnelAiMessageAvatar />
        <p className="flex-1 min-w-0 text-sm leading-relaxed text-[#ffffff] pt-0.5">
          Your Tuesday Reel got 4.2x your average reach. Short hook + trending audio was the
          formula. Want me to draft a similar post?
        </p>
      </div>
    </div>
  );
}

function AiMessage({ text }: { text: string }) {
  return (
    <div className="flex items-start gap-3 chat-hero-message-enter">
      <FunnelAiMessageAvatar />
      <p className="text-base leading-relaxed text-[var(--chat-hero-text)] whitespace-pre-line flex-1 min-w-0 pt-0.5">
        {text}
      </p>
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
        disabled ? 'opacity-50 pointer-events-none' : '',
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
        'chat-hero-pill-enter chat-hero-platform-btn flex w-full items-center justify-center rounded-xl border px-4 py-3 text-center text-sm font-medium transition-all duration-150 min-h-[72px]',
        selected ? 'chat-hero-platform-btn--selected' : '',
        disabled ? 'opacity-50 pointer-events-none' : '',
      ].join(' ')}
    >
      {label}
    </button>
  );
}

export default function ChatHero() {
  const { signInWithGoogle } = useAuth();
  const { openSignup } = useAuthModal();

  const [sideDemosReady, setSideDemosReady] = useState(true);

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
  const scrollRootRef = useRef<HTMLElement>(null);
  const flowLock = useRef(false);

  const { segmentFloat, hasScrolled } = useHeroScrollProgress(scrollRootRef);

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
    setSideDemosReady(true);
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

    appendBlocks([
      {
        id: blockId('user'),
        kind: 'user_pills',
        labels: platformLabels,
      },
    ]);

    setStep(1);

    await playTypingThen(800, async () => {
      appendBlocks([
        {
          id: blockId('ai'),
          kind: 'ai',
          text: painDiscoveryMessage(platformLabels),
        },
      ]);
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
      appendBlocks([
        {
          id: blockId('ai'),
          kind: 'ai',
          text: demoMessageForPainPoint(selectedPain),
        },
      ]);

      trackChatHeroEvent('demo_completed', { pain_point: selectedPain });
      await delay(400);

      await playTypingThen(800, async () => {
        appendBlocks([
          {
            id: blockId('ai'),
            kind: 'ai',
            text: 'Want to see this working on your actual accounts?',
          },
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
    if (showPlatformOptions) {
      const lower = trimmed.toLowerCase();
      if (/instagram|ig\b|insta/.test(lower) && /post|publish|reel/.test(lower)) {
        setSelectedPlatforms((prev) => [...new Set([...prev, 'instagram' as ChatHeroPlatformId])]);
      }
      if (/tiktok|tik tok/.test(lower) && /post|publish|video|from here|can you|can i/.test(lower)) {
        setSelectedPlatforms((prev) => [...new Set([...prev, 'tiktok' as ChatHeroPlatformId])]);
      }
    }
    if (showPainOptions && matchedPain) {
      setSelectedPain(matchedPain);
    }

    const isPlatformOnly =
      step === 0 &&
      showPlatformOptions &&
      matchedPlatforms.length > 0 &&
      trimmed.split(/\s+/).length <= 3;

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
            selectedPlatformIds: [
              ...new Set([...selectedPlatforms, ...matchedPlatforms]),
            ],
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
    <section
      ref={scrollRootRef}
      className="chat-hero-scroll-root chat-hero relative"
      style={{ minHeight: `${HERO_SCROLL_TOTAL_VH}vh` }}
    >
      <HeroScrollProgress segmentFloat={segmentFloat} />

      <div className="chat-hero-sticky-shell">
        <ChatHeroDemoLoopProvider active={sideDemosReady}>
          <div className="relative flex h-full w-full max-w-[1920px] mx-auto items-stretch">
            <ChatHeroSideDemoColumn
              side="left"
              segmentFloat={segmentFloat}
              visible={sideDemosReady}
            />

            <div className="chat-hero__main flex flex-1 min-h-0 min-w-0 flex-col w-full px-0 md:px-3 xl:px-4 pt-2 sm:pt-2 pb-3 sm:pb-4">
              <h1 className="sr-only">iZop, your personal AI social media manager</h1>

              <div
                ref={scrollRef}
                className="flex flex-1 min-h-0 w-full flex-col overflow-y-auto pb-2 pt-2 sm:pt-3 px-2 md:px-0"
              >
                <div className="w-full space-y-3 shrink-0">
                  {blocks.map((block) => {
                    if (block.kind === 'ai') {
                      if (block.isOpening) {
                        return <OpeningMessage key={block.id} />;
                      }
                      return <AiMessage key={block.id} text={block.text} />;
                    }
                    return (
                      <div key={block.id} className="flex flex-wrap justify-end gap-2 chat-hero-message-enter">
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
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 sm:gap-3 w-full">
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
                  <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-2.5 w-full shrink-0">
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

              <ChatHeroMobileDemoPanel segmentFloat={segmentFloat} visible={sideDemosReady} />

              <div className="shrink-0 pt-3 pb-3 px-2 md:px-0">
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
                  <div className="space-y-3 chat-hero-continue-enter">
                    {authError ? <p className="text-sm text-red-600">{authError}</p> : null}
                    <button
                      type="button"
                      disabled={authLoading}
                      onClick={() => void handleGoogleSignup()}
                      className="btn-google-lime w-full flex items-center justify-center gap-3 rounded-full px-7 py-3 text-[15px] font-semibold disabled:cursor-not-allowed"
                    >
                      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                      </svg>
                      {authLoading ? 'Redirecting…' : 'Continue with Google'}
                    </button>
                    <button
                      type="button"
                      onClick={handleEmailSignup}
                      className="w-full rounded-full border border-[var(--chat-hero-border)] bg-[var(--chat-hero-bg)] px-7 py-3 text-[15px] font-medium text-[var(--chat-hero-muted)] hover:border-[#7C3AED] hover:text-[var(--chat-hero-text)] transition-all"
                    >
                      Continue with email
                    </button>
                    <p className="text-center text-xs text-[var(--chat-hero-muted)]">
                      Free forever plan available · No credit card required
                    </p>
                  </div>
                ) : null}
              </div>

              <div className="mt-3 flex w-full flex-col gap-2">
                <form
                  className="chat-hero-input-form flex w-full items-center gap-2"
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
                    className="flex-1 min-w-0 bg-transparent text-[15px] text-[var(--chat-hero-text)] placeholder:text-[var(--chat-hero-muted)] outline-none disabled:opacity-50"
                    aria-label="Message iZop"
                  />
                  <button
                    type="submit"
                    disabled={!draftText.trim() || busy || isTyping}
                    className="chat-hero-send-btn flex h-9 w-9 shrink-0 items-center justify-center disabled:opacity-40 disabled:pointer-events-none"
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
            </div>

            <div className="xl:hidden mt-1 px-2 pb-1 overflow-x-auto shrink-0">
              <div className="flex gap-2 w-max min-w-full justify-start sm:justify-center">
                {MOBILE_FEATURE_CHIPS.map((chip) => (
                  <span key={chip.label} className="chat-hero-mobile-chip whitespace-nowrap">
                    {chip.emoji} {chip.label}
                  </span>
                ))}
              </div>
            </div>
          </div>

            <ChatHeroSideDemoColumn
              side="right"
              segmentFloat={segmentFloat}
              visible={sideDemosReady}
            />
          </div>
          <HeroScrollHint visible={!hasScrolled} />
        </ChatHeroDemoLoopProvider>
      </div>
    </section>
  );
}
