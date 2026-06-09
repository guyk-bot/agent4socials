'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { ChevronDown } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useAuthModal } from '@/context/AuthModalContext';
import { BrandWordmark } from '@/components/BrandWordmark';
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
import { BRAND_NAME, SITE_LOGO_DARK_SRC } from '@/lib/site-brand-assets';
import { setFunnelPostAuthRedirect } from '@/lib/funnel-onboarding';
import { trackChatHeroEvent } from '@/lib/chat-hero-analytics';
import {
  CHAT_HERO_PAIN_POINTS,
  CHAT_HERO_PLATFORMS,
  connectRedirectForPlatforms,
  demoBlocksForPainPoint,
  formatPlatformList,
  painDiscoveryMessage,
  type ChatHeroPainPointId,
  type ChatHeroPlatformId,
  type DemoBlock,
} from '@/lib/chat-hero-script';

type FlowStep = 0 | 1 | 2 | 3;

type RenderBlock =
  | { id: string; kind: 'ai'; text: string; animate?: boolean }
  | { id: string; kind: 'user_pills'; labels: string[] }
  | { id: string; kind: 'stats'; items: { value: string; label: string }[] }
  | { id: string; kind: 'mock_chat'; user: string; ai: string }
  | { id: string; kind: 'ideas'; items: string[] }
  | { id: string; kind: 'badges'; items: string[] };

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

const INITIAL_AI_TEXT = "Hey! 👋 What platforms are you currently posting on?";

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function blockId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function demoBlockToRender(block: DemoBlock): RenderBlock[] {
  if (block.kind === 'text') {
    return [{ id: blockId('ai'), kind: 'ai', text: block.text }];
  }
  if (block.kind === 'stats') {
    return [{ id: blockId('stats'), kind: 'stats', items: block.items }];
  }
  if (block.kind === 'mock_chat') {
    return [{ id: blockId('mock'), kind: 'mock_chat', user: block.user, ai: block.ai }];
  }
  if (block.kind === 'ideas') {
    return [{ id: blockId('ideas'), kind: 'ideas', items: block.items }];
  }
  return [{ id: blockId('badges'), kind: 'badges', items: block.items }];
}

function TypewriterText({
  text,
  active,
  onComplete,
}: {
  text: string;
  active: boolean;
  onComplete?: () => void;
}) {
  const [displayed, setDisplayed] = useState('');
  const doneRef = useRef(false);

  useEffect(() => {
    if (!active) return;
    setDisplayed('');
    doneRef.current = false;
    let i = 0;
    const tick = () => {
      i += 1;
      setDisplayed(text.slice(0, i));
      if (i >= text.length) {
        if (!doneRef.current) {
          doneRef.current = true;
          onComplete?.();
        }
        return;
      }
      window.setTimeout(tick, 22);
    };
    const start = window.setTimeout(tick, 120);
    return () => window.clearTimeout(start);
  }, [active, text, onComplete]);

  if (!active) return <span>{text}</span>;
  return (
    <span>
      {displayed}
      {displayed.length < text.length ? (
        <span className="inline-block w-[2px] h-[1em] ml-0.5 bg-white/70 animate-pulse align-middle" />
      ) : null}
    </span>
  );
}

function TypingIndicator() {
  return (
    <div className="flex items-center gap-3 chat-hero-message-enter">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={SITE_LOGO_DARK_SRC} alt="" className="h-6 w-6 shrink-0 object-contain" />
      <div className="flex items-center gap-1.5 py-1">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="chat-hero-typing-dot h-2 w-2 rounded-full bg-[#888780]"
            style={{ animationDelay: `${i * 200}ms` }}
          />
        ))}
      </div>
    </div>
  );
}

function AiMessage({
  text,
  typewriter,
  typewriterActive,
  onTypewriterComplete,
}: {
  text: string;
  typewriter?: boolean;
  typewriterActive?: boolean;
  onTypewriterComplete?: () => void;
}) {
  return (
    <div className="flex items-start gap-3 chat-hero-message-enter">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={SITE_LOGO_DARK_SRC} alt="" className="h-6 w-6 shrink-0 object-contain mt-0.5" />
      <p className="text-[15px] leading-[1.6] text-white whitespace-pre-line flex-1 min-w-0">
        {typewriter ? (
          <TypewriterText text={text} active={!!typewriterActive} onComplete={onTypewriterComplete} />
        ) : (
          text
        )}
      </p>
    </div>
  );
}

function PillButton({
  label,
  selected,
  disabled,
  icon,
  onClick,
  staggerIndex,
}: {
  label: string;
  selected: boolean;
  disabled?: boolean;
  icon?: React.ReactNode;
  onClick: () => void;
  staggerIndex?: number;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      style={{ animationDelay: staggerIndex !== undefined ? `${staggerIndex * 80}ms` : undefined }}
      className={[
        'chat-hero-pill-enter inline-flex items-center gap-2 rounded-full border px-[18px] py-[10px] text-sm transition-all duration-150',
        'active:scale-[0.97]',
        selected
          ? 'border-[#7C3AED] bg-[rgba(124,58,237,0.15)] text-white'
          : 'border-[#2A2A38] bg-[#1E1E2A] text-[#888780] hover:border-[#7C3AED] hover:text-white',
        disabled ? 'opacity-50 pointer-events-none' : '',
      ].join(' ')}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

export default function ChatHero() {
  const { signInWithGoogle } = useAuth();
  const { openLogin, openSignup } = useAuthModal();

  const [heroReady, setHeroReady] = useState(false);
  const [headlineReady, setHeadlineReady] = useState(false);
  const [subheadReady, setSubheadReady] = useState(false);
  const [chatReady, setChatReady] = useState(false);

  const [step, setStep] = useState<FlowStep>(0);
  const [blocks, setBlocks] = useState<RenderBlock[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const [busy, setBusy] = useState(false);

  const [selectedPlatforms, setSelectedPlatforms] = useState<ChatHeroPlatformId[]>([]);
  const [selectedPain, setSelectedPain] = useState<ChatHeroPainPointId | null>(null);

  const [showPlatformOptions, setShowPlatformOptions] = useState(false);
  const [showPainOptions, setShowPainOptions] = useState(false);
  const [showDemoCta, setShowDemoCta] = useState(false);
  const [showSignup, setShowSignup] = useState(false);
  const [typewriterDone, setTypewriterDone] = useState(false);

  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState('');

  const scrollRef = useRef<HTMLDivElement>(null);
  const flowLock = useRef(false);

  const platformLabels = useMemo(
    () =>
      selectedPlatforms
        .map((id) => CHAT_HERO_PLATFORMS.find((p) => p.id === id)?.label)
        .filter((l): l is string => Boolean(l)),
    [selectedPlatforms]
  );

  const progressPct = useMemo(() => {
    if (step === 0) return 25;
    if (step === 1) return 50;
    if (step === 2) return 75;
    return 100;
  }, [step]);

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
    const t1 = window.setTimeout(() => setHeroReady(true), 50);
    const t2 = window.setTimeout(() => setHeadlineReady(true), 100);
    const t3 = window.setTimeout(() => setSubheadReady(true), 300);
    const t4 = window.setTimeout(() => setChatReady(true), 500);
    const t5 = window.setTimeout(() => {
      setBlocks([{ id: blockId('ai'), kind: 'ai', text: INITIAL_AI_TEXT, animate: true }]);
    }, 700);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      window.clearTimeout(t3);
      window.clearTimeout(t4);
      window.clearTimeout(t5);
    };
  }, []);

  const handleTypewriterComplete = useCallback(() => {
    setTypewriterDone(true);
    setShowPlatformOptions(true);
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
      await delay(600);
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

    await playTypingThen(1200, async () => {
      const demo = demoBlocksForPainPoint(selectedPain);
      for (let i = 0; i < demo.length; i += 1) {
        const rendered = demoBlockToRender(demo[i]);
        appendBlocks(rendered);
        if (i < demo.length - 1) await delay(600);
      }

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

  const canPlatformContinue = selectedPlatforms.length > 0 && !busy;
  const canPainContinue = selectedPain !== null && !busy;

  return (
    <section className="chat-hero relative min-h-[100svh] md:min-h-screen flex flex-col bg-[#0A0A0F] text-white overflow-hidden">
      {/* Bottom fade into light page */}
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 h-40 z-[1]"
        style={{
          background: 'linear-gradient(to bottom, transparent, rgba(248,247,252,0.92))',
        }}
      />

      {/* Purple glow behind chat */}
      <div
        className="pointer-events-none absolute left-1/2 top-[48%] -translate-x-1/2 -translate-y-1/2 h-[420px] w-[min(92vw,720px)] rounded-full z-0"
        style={{ boxShadow: '0 0 80px rgba(124,58,237,0.08)' }}
      />

      {/* Minimal header (persists while browsing landing sections below) */}
      <header
        className={`fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-4 sm:px-6 py-4 bg-[#0A0A0F]/90 backdrop-blur-md border-b border-[#1E1E2A]/60 transition-opacity duration-600 ${
          heroReady ? 'opacity-100' : 'opacity-0'
        }`}
      >
        <div className="mx-auto flex w-full max-w-[680px] items-center justify-between">
        <Link href="/" className="flex items-center gap-2.5 min-w-0 hover:opacity-90 transition-opacity">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={SITE_LOGO_DARK_SRC} alt={BRAND_NAME} className="h-7 w-7 object-contain shrink-0" />
          <BrandWordmark name={BRAND_NAME} className="text-base font-semibold tracking-tight text-white" />
        </Link>
        <button
          type="button"
          onClick={openLogin}
          className="text-sm text-[#888780] hover:text-white transition-colors"
        >
          Log in
        </button>
        </div>
      </header>

      {/* Hero content */}
      <div className="relative z-10 flex-1 flex flex-col items-center justify-center px-4 sm:px-6 pb-10 pt-24 sm:pt-28 max-w-[680px] mx-auto w-full">
        <h1
          className={`text-[28px] sm:text-[48px] font-semibold tracking-[-0.5px] text-white text-center mb-2 transition-all duration-600 ${
            headlineReady ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3'
          }`}
        >
          Meet your AI social media manager.
        </h1>
        <p
          className={`text-base sm:text-lg text-[#888780] text-center mb-8 max-w-xl transition-all duration-500 ${
            subheadReady ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3'
          }`}
        >
          Tell us what platforms you&apos;re on — we&apos;ll show you what iZop can do.
        </p>

        {/* Chat container */}
        <div
          className={`relative w-full max-w-[640px] transition-all duration-400 sticky top-20 sm:top-24 ${
            chatReady ? 'opacity-100 scale-100' : 'opacity-0 scale-[0.97]'
          }`}
        >
          <div
            className="relative rounded-[12px] md:rounded-[16px] border border-[#1E1E2A] bg-[#111118] p-6 min-h-[420px] flex flex-col"
            style={{
              boxShadow:
                '0 0 0 1px rgba(124,58,237,0.1), 0 20px 60px rgba(0,0,0,0.4), 0 0 80px rgba(124,58,237,0.08)',
            }}
          >
            {/* Progress */}
            <div className="absolute top-0 left-0 right-0 h-[2px] bg-[#1E1E2A] rounded-t-2xl overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-[#7C3AED] to-[#4F46E5] transition-all duration-500 ease-out"
                style={{ width: `${progressPct}%` }}
              />
            </div>

            <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-5 pr-1 -mr-1 mt-1">
              {blocks.map((block, index) => {
                if (block.kind === 'ai') {
                  const isFirst = index === 0 && block.text === INITIAL_AI_TEXT;
                  return (
                    <AiMessage
                      key={block.id}
                      text={block.text}
                      typewriter={isFirst}
                      typewriterActive={isFirst && !typewriterDone}
                      onTypewriterComplete={isFirst ? handleTypewriterComplete : undefined}
                    />
                  );
                }
                if (block.kind === 'user_pills') {
                  return (
                    <div key={block.id} className="flex flex-wrap justify-end gap-2 chat-hero-message-enter">
                      {block.labels.map((label) => (
                        <span
                          key={label}
                          className="rounded-full border border-[#7C3AED] bg-[rgba(124,58,237,0.15)] px-[18px] py-[10px] text-sm text-white"
                        >
                          {label}
                        </span>
                      ))}
                    </div>
                  );
                }
                if (block.kind === 'stats') {
                  return (
                    <div key={block.id} className="flex flex-wrap gap-2 chat-hero-message-enter pl-9">
                      {block.items.map((item) => (
                        <div
                          key={item.label}
                          className="rounded-xl border border-[#2A2A38] bg-[#1A1A24] px-4 py-3 min-w-[120px]"
                        >
                          <p className="text-lg font-semibold text-white">{item.value}</p>
                          <p className="text-xs text-[#888780] mt-0.5">{item.label}</p>
                        </div>
                      ))}
                    </div>
                  );
                }
                if (block.kind === 'mock_chat') {
                  return (
                    <div key={block.id} className="space-y-3 pl-9 chat-hero-message-enter">
                      <div className="rounded-xl border border-[#2A2A38] bg-[#1A1A24] px-4 py-3 text-sm text-[#C4C4CC]">
                        {block.user}
                      </div>
                      <div className="rounded-xl border border-[#7C3AED]/30 bg-[rgba(124,58,237,0.08)] px-4 py-3 text-sm text-white leading-relaxed">
                        {block.ai}
                      </div>
                    </div>
                  );
                }
                if (block.kind === 'ideas') {
                  return (
                    <div key={block.id} className="space-y-2 pl-9 chat-hero-message-enter">
                      {block.items.map((idea, i) => (
                        <div
                          key={idea}
                          className="rounded-xl border border-[#2A2A38] bg-[#1A1A24] px-4 py-3 text-sm text-white/90"
                        >
                          <span className="text-[#7C3AED] font-medium mr-2">{i + 1}.</span>
                          {idea}
                        </div>
                      ))}
                    </div>
                  );
                }
                return (
                  <div key={block.id} className="flex flex-wrap gap-2 pl-9 chat-hero-message-enter">
                    {block.items.map((badge) => (
                      <span
                        key={badge}
                        className="rounded-full border border-[#2A2A38] bg-[#1A1A24] px-3 py-1.5 text-xs text-[#C4C4CC]"
                      >
                        {badge}
                      </span>
                    ))}
                  </div>
                );
              })}

              {isTyping ? <TypingIndicator /> : null}
            </div>

            {/* Interactive controls */}
            <div className="mt-5 space-y-4">
              {showPlatformOptions ? (
                <div className="flex flex-wrap gap-2">
                  {CHAT_HERO_PLATFORMS.map((platform, i) => {
                    const Icon = PLATFORM_ICONS[platform.id];
                    const selected = selectedPlatforms.includes(platform.id);
                    return (
                      <PillButton
                        key={platform.id}
                        label={platform.label}
                        selected={selected}
                        disabled={busy}
                        staggerIndex={i}
                        icon={<Icon size={16} />}
                        onClick={() => togglePlatform(platform.id)}
                      />
                    );
                  })}
                </div>
              ) : null}

              {showPainOptions ? (
                <div className="flex flex-wrap gap-2">
                  {CHAT_HERO_PAIN_POINTS.map((pain, i) => (
                    <PillButton
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

              {showPlatformOptions && canPlatformContinue ? (
                <button
                  type="button"
                  onClick={() => void handlePlatformsContinue()}
                  className="chat-hero-continue-enter w-full sm:w-auto rounded-full bg-gradient-to-br from-[#7C3AED] to-[#4F46E5] px-7 py-3 text-[15px] font-medium text-white hover:brightness-110 transition-all"
                >
                  Continue →
                </button>
              ) : null}

              {showPainOptions && canPainContinue ? (
                <button
                  type="button"
                  onClick={() => void handlePainContinue()}
                  className="chat-hero-continue-enter w-full sm:w-auto rounded-full bg-gradient-to-br from-[#7C3AED] to-[#4F46E5] px-7 py-3 text-[15px] font-medium text-white hover:brightness-110 transition-all"
                >
                  Show me →
                </button>
              ) : null}

              {showDemoCta ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void handleStartForFree()}
                  className="chat-hero-continue-enter w-full sm:w-auto rounded-full bg-gradient-to-br from-[#7C3AED] to-[#4F46E5] px-7 py-3 text-[15px] font-medium text-white hover:brightness-110 transition-all"
                >
                  Start for free — no credit card →
                </button>
              ) : null}

              {showSignup ? (
                <div className="space-y-3 chat-hero-continue-enter">
                  {authError ? (
                    <p className="text-sm text-red-400">{authError}</p>
                  ) : null}
                  <button
                    type="button"
                    disabled={authLoading}
                    onClick={() => void handleGoogleSignup()}
                    className="w-full flex items-center justify-center gap-3 rounded-full bg-gradient-to-br from-[#7C3AED] to-[#4F46E5] px-7 py-3 text-[15px] font-medium text-white hover:brightness-110 transition-all disabled:opacity-50"
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
                    className="w-full rounded-full border border-[#2A2A38] bg-transparent px-7 py-3 text-[15px] font-medium text-[#C4C4CC] hover:border-[#7C3AED] hover:text-white transition-all"
                  >
                    Continue with email
                  </button>
                  <p className="text-center text-xs text-[#888780]">
                    Free forever plan available · No credit card required
                  </p>
                </div>
              ) : null}
            </div>
          </div>
        </div>

        {/* Scroll hint */}
        <a
          href="#features"
          className={`mt-8 flex flex-col items-center gap-1 text-xs text-[#888780] hover:text-white transition-colors ${
            heroReady ? 'opacity-100' : 'opacity-0'
          }`}
        >
          <span>Scroll to learn more</span>
          <ChevronDown className="h-4 w-4 animate-bounce" />
        </a>
      </div>
    </section>
  );
}
