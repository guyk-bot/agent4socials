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
import { useTheme } from '@/context/ThemeContext';
import { funnelAiMessageLogoSrc } from '@/components/landing/funnel-demos/funnel-demo-assets';
import { setFunnelPostAuthRedirect } from '@/lib/funnel-onboarding';
import { trackChatHeroEvent } from '@/lib/chat-hero-analytics';
import {
  ChatHeroDemoLoopProvider,
  ChatHeroSideDemoColumn,
} from '@/components/landing/funnel-demos/ChatHeroSideDemos';
import {
  CHAT_HERO_PAIN_POINTS,
  CHAT_HERO_PLATFORMS,
  connectRedirectForPlatforms,
  demoBlocksForPainPoint,
  formatPlatformList,
  answerLandingChatQuestion,
  matchPainPointFromText,
  matchPlatformsFromText,
  painDiscoveryMessage,
  type ChatHeroPainPointId,
  type ChatHeroPlatformId,
  type DemoBlock,
} from '@/lib/chat-hero-script';

type FlowStep = 0 | 1 | 2 | 3;

type RenderBlock =
  | { id: string; kind: 'ai'; text: string; animate?: boolean; prominent?: boolean; isOpening?: boolean }
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

const OPENING_GREETING = "Hi 👋 I'm iZop,";
const OPENING_HEADLINE = 'your personal AI social media manager.';
const OPENING_BODY =
  "Tell me what platforms you're on, and I'll show you what I can do.";

const INITIAL_AI_TEXT = `${OPENING_GREETING}\n${OPENING_HEADLINE}\n${OPENING_BODY}`;

function getOpeningLineParts(displayed: string): [string, string, string] {
  const lines = displayed.split('\n');
  return [lines[0] ?? '', lines[1] ?? '', lines[2] ?? ''];
}

function getActiveOpeningLineIndex(displayed: string): number {
  const lines = displayed.split('\n');
  if (lines.length <= 1) return 0;
  if (lines.length === 2) return 1;
  return 2;
}

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
        <span className="inline-block w-[2px] h-[1em] ml-0.5 bg-[var(--chat-hero-cursor)] animate-pulse align-middle" />
      ) : null}
    </span>
  );
}

function FunnelAiMessageAvatar({ className }: { className?: string }) {
  const { theme } = useTheme();
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={funnelAiMessageLogoSrc(theme)}
      alt=""
      className={className ?? 'h-8 w-8 sm:h-9 sm:w-9 shrink-0 object-contain'}
      aria-hidden
    />
  );
}

function TypingIndicator() {
  return (
    <div className="flex items-start gap-3 chat-hero-message-enter" aria-label="Thinking">
      <FunnelAiMessageAvatar className="h-8 w-8 sm:h-9 sm:w-9 shrink-0 object-contain mt-0.5" />
    </div>
  );
}

function OpeningAiMessage({
  typewriterActive,
  onTypewriterComplete,
}: {
  typewriterActive?: boolean;
  onTypewriterComplete?: () => void;
}) {
  const [displayed, setDisplayed] = useState('');
  const doneRef = useRef(false);

  useEffect(() => {
    if (!typewriterActive) return;
    setDisplayed('');
    doneRef.current = false;
    let i = 0;
    const tick = () => {
      i += 1;
      setDisplayed(INITIAL_AI_TEXT.slice(0, i));
      if (i >= INITIAL_AI_TEXT.length) {
        if (!doneRef.current) {
          doneRef.current = true;
          onTypewriterComplete?.();
        }
        return;
      }
      window.setTimeout(tick, 22);
    };
    const start = window.setTimeout(tick, 120);
    return () => window.clearTimeout(start);
  }, [typewriterActive, onTypewriterComplete]);

  const [greeting, headline, body] = typewriterActive
    ? getOpeningLineParts(displayed)
    : [OPENING_GREETING, OPENING_HEADLINE, OPENING_BODY];
  const showCursor = !!typewriterActive && displayed.length < INITIAL_AI_TEXT.length;
  const activeLine = getActiveOpeningLineIndex(displayed);

  const rows: { key: string; text: string; className: string }[] = [
    {
      key: 'greeting',
      text: greeting,
      className: 'block text-[15px] sm:text-[16px] font-normal leading-[1.6]',
    },
    {
      key: 'headline',
      text: headline,
      className:
        'block text-[22px] sm:text-[26px] lg:text-[28px] font-black tracking-[-0.02em] leading-[1.2] mt-1.5 sm:mt-2',
    },
    {
      key: 'body',
      text: body,
      className:
        'block text-[13px] sm:text-[15px] font-normal leading-[1.6] mt-2 whitespace-nowrap',
    },
  ];

  return (
    <div className="flex items-start gap-3 chat-hero-message-enter mt-5 sm:mt-7">
      <FunnelAiMessageAvatar className="h-8 w-8 sm:h-9 sm:w-9 shrink-0 object-contain mt-1" />
      <div className="flex-1 min-w-0 text-[var(--chat-hero-text)]">
        {rows.map((row, index) => {
          if (!row.text && !(showCursor && index === activeLine)) return null;
          return (
            <p key={row.key} className={row.className}>
              {row.text}
              {showCursor && index === activeLine ? (
                <span className="inline-block w-[2px] h-[1em] ml-0.5 bg-[var(--chat-hero-cursor)] animate-pulse align-middle" />
              ) : null}
            </p>
          );
        })}
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
      <FunnelAiMessageAvatar className="h-8 w-8 sm:h-9 sm:w-9 shrink-0 object-contain mt-0.5" />
      <p className="text-[16px] leading-[1.6] text-[var(--chat-hero-text)] whitespace-pre-line flex-1 min-w-0">
        {typewriter ? (
          <TypewriterText text={text} active={!!typewriterActive} onComplete={onTypewriterComplete} />
        ) : (
          text
        )}
      </p>
    </div>
  );
}

function OptionSquareButton({
  label,
  selected,
  disabled,
  icon,
  onClick,
  staggerIndex,
  variant = 'compact',
}: {
  label: string;
  selected: boolean;
  disabled?: boolean;
  icon?: React.ReactNode;
  onClick: () => void;
  staggerIndex?: number;
  variant?: 'compact' | 'tall';
}) {
  const isTall = variant === 'tall';
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      style={{ animationDelay: staggerIndex !== undefined ? `${staggerIndex * 60}ms` : undefined }}
      className={[
        'chat-hero-pill-enter flex w-full flex-col items-center justify-center rounded-lg border p-2 transition-all duration-150',
        isTall ? 'min-h-[96px] sm:min-h-[108px] gap-1.5' : 'h-[80px] sm:h-[92px] gap-1.5',
        'active:scale-[0.97]',
        selected
          ? 'border-[#7C3AED] bg-[var(--chat-hero-accent-soft)] shadow-[0_0_0_1px_rgba(124,58,237,0.2)]'
          : 'border-[var(--chat-hero-border)] bg-[var(--chat-hero-surface)] hover:border-[#7C3AED]/50 hover:bg-[var(--chat-hero-bg)]',
        disabled ? 'opacity-50 pointer-events-none' : '',
      ].join(' ')}
    >
      {icon ? (
        <span className="flex h-10 w-10 sm:h-12 sm:w-12 items-center justify-center">{icon}</span>
      ) : null}
      <span
        className={`text-center font-medium leading-snug px-1 ${
          isTall ? 'text-xs sm:text-sm' : 'text-[11px] sm:text-xs'
        } ${selected ? 'text-[var(--chat-hero-accent-text)]' : 'text-[var(--chat-hero-text)]'}`}
      >
        {label}
      </span>
    </button>
  );
}

export default function ChatHero() {
  const { signInWithGoogle } = useAuth();
  const { openSignup } = useAuthModal();

  const [heroReady, setHeroReady] = useState(false);
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
  const [draftText, setDraftText] = useState('');

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
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
    const timers: number[] = [];
    timers.push(window.setTimeout(() => setHeroReady(true), 50));
    timers.push(window.setTimeout(() => setChatReady(true), 200));
    timers.push(window.setTimeout(() => setIsTyping(true), 350));
    timers.push(
      window.setTimeout(() => {
        setIsTyping(false);
        setBlocks([
          {
            id: blockId('ai'),
            kind: 'ai',
            text: INITIAL_AI_TEXT,
            animate: true,
            prominent: true,
            isOpening: true,
          },
        ]);
      }, 900)
    );
    return () => {
      for (const id of timers) window.clearTimeout(id);
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

  const handleFreeTextSubmit = useCallback(async () => {
    const trimmed = draftText.trim();
    if (!trimmed || busy || isTyping) return;

    setDraftText('');
    appendBlocks([{ id: blockId('user'), kind: 'user_pills', labels: [trimmed] }]);

    const matchedPlatforms = matchPlatformsFromText(trimmed);
    const matchedPain = matchPainPointFromText(trimmed);

    if (showPlatformOptions && matchedPlatforms.length > 0) {
      setSelectedPlatforms((prev) => [...new Set([...prev, ...matchedPlatforms])]);
    }
    // Also select platform when user asks about posting on a specific one
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
              ...new Set([
                ...selectedPlatforms,
                ...matchedPlatforms,
              ]),
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
    if (showPlatformOptions) return 'Ask anything — pricing, features, platforms, how it works…';
    return 'Message iZop…';
  }, [showDemoCta, showPainOptions, showPlatformOptions, showSignup]);

  const canPlatformContinue = selectedPlatforms.length > 0 && !busy;
  const canPainContinue = selectedPain !== null && !busy;

  return (
    <section className="chat-hero relative flex h-[calc(100dvh-0.5rem)] max-h-[calc(100dvh-0.5rem)] flex-col overflow-hidden pt-14 sm:pt-16">
      <ChatHeroDemoLoopProvider>
      <div
        className={`flex flex-1 min-h-0 w-full max-w-[1920px] mx-auto transition-opacity duration-500 ${
          heroReady ? 'opacity-100' : 'opacity-0'
        }`}
      >
        <ChatHeroSideDemoColumn side="left" />
        <div
          className={`flex flex-1 min-h-0 min-w-0 flex-col w-full px-2 sm:px-3 xl:px-4 pt-2 sm:pt-2 pb-3 sm:pb-4 transition-all duration-400 ${
            chatReady ? 'opacity-100' : 'opacity-0 translate-y-1'
          }`}
        >
          <h1 className="sr-only">iZop, your personal AI social media manager</h1>

          <div ref={scrollRef} className="flex flex-1 min-h-0 w-full flex-col overflow-y-auto pb-4 pt-2 sm:pt-3">
            <div className="w-full space-y-3 shrink-0">
              {blocks.map((block, index) => {
                if (block.kind === 'ai') {
                  if (block.isOpening) {
                    return (
                      <OpeningAiMessage
                        key={block.id}
                        typewriterActive={!typewriterDone}
                        onTypewriterComplete={handleTypewriterComplete}
                      />
                    );
                  }
                  return (
                    <AiMessage
                      key={block.id}
                      text={block.text}
                      typewriter={false}
                    />
                  );
                }
                if (block.kind === 'user_pills') {
                  return (
                    <div key={block.id} className="flex flex-wrap justify-end gap-2 chat-hero-message-enter">
                      {block.labels.map((label) => (
                        <span
                          key={label}
                          className="rounded-full border border-[#7C3AED] bg-[var(--chat-hero-accent-soft)] px-[18px] py-[10px] text-sm text-[var(--chat-hero-accent-text)] font-medium"
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
                          className="rounded-xl border border-[var(--chat-hero-border)] bg-[var(--chat-hero-surface)] px-5 py-4 min-w-[140px]"
                        >
                          <p className="text-xl font-semibold text-[var(--chat-hero-text)]">{item.value}</p>
                          <p className="text-xs text-[var(--chat-hero-muted)] mt-0.5">{item.label}</p>
                        </div>
                      ))}
                    </div>
                  );
                }
                if (block.kind === 'mock_chat') {
                  return (
                    <div key={block.id} className="space-y-3 pl-9 chat-hero-message-enter">
                      <div className="rounded-xl border border-[var(--chat-hero-border)] bg-[var(--chat-hero-surface)] px-4 py-3 text-sm text-[var(--chat-hero-muted)]">
                        {block.user}
                      </div>
                      <div className="rounded-xl border border-[#7C3AED]/25 bg-[var(--chat-hero-accent-soft)] px-4 py-3 text-sm text-[var(--chat-hero-text)] leading-relaxed">
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
                          className="rounded-xl border border-[var(--chat-hero-border)] bg-[var(--chat-hero-surface)] px-4 py-3 text-sm text-[var(--chat-hero-text)]"
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
                        className="rounded-full border border-[var(--chat-hero-border)] bg-[var(--chat-hero-surface)] px-3 py-1.5 text-xs text-[var(--chat-hero-muted)]"
                      >
                        {badge}
                      </span>
                    ))}
                  </div>
                );
              })}

              {isTyping ? <TypingIndicator /> : null}
            </div>

            {showPlatformOptions ? (
              <div className="mt-3 grid grid-cols-4 gap-2.5 sm:gap-3 w-full shrink-0">
                {CHAT_HERO_PLATFORMS.map((platform, i) => {
                  const Icon = PLATFORM_ICONS[platform.id];
                  const selected = selectedPlatforms.includes(platform.id);
                  return (
                    <OptionSquareButton
                      key={platform.id}
                      label={platform.label}
                      selected={selected}
                      disabled={busy}
                      staggerIndex={i}
                      icon={<Icon size={30} />}
                      onClick={() => togglePlatform(platform.id)}
                    />
                  );
                })}
              </div>
            ) : null}

            {showPainOptions ? (
              <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-2.5 w-full shrink-0">
                {CHAT_HERO_PAIN_POINTS.map((pain, i) => (
                  <OptionSquareButton
                    key={pain.id}
                    label={pain.label}
                    selected={selectedPain === pain.id}
                    disabled={busy}
                    staggerIndex={i}
                    variant="tall"
                    onClick={() => setSelectedPain(pain.id)}
                  />
                ))}
              </div>
            ) : null}
          </div>

          <div className="shrink-0 border-t border-[var(--chat-hero-border)] pt-3 pb-3">
            <div className="space-y-3">
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
                    <p className="text-sm text-red-600">{authError}</p>
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
              className="flex w-full items-center gap-2 rounded-2xl border border-[var(--chat-hero-border)] bg-[var(--chat-hero-input-bg)] px-3 py-2 sm:px-4 sm:py-2.5 shadow-sm focus-within:border-[#7C3AED]/40 focus-within:ring-2 focus-within:ring-[#7C3AED]/15"
              onSubmit={(e) => {
                e.preventDefault();
                void handleFreeTextSubmit();
              }}
            >
              <input
                ref={inputRef}
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
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#7C3AED] to-[#4F46E5] text-white transition-all hover:brightness-110 disabled:opacity-40 disabled:pointer-events-none"
                aria-label="Send message"
              >
                <ArrowUp className="h-4 w-4" />
              </button>
            </form>

            <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 text-[11px] sm:text-xs text-[var(--chat-hero-muted)] pt-0.5">
              <span className="flex items-center gap-1.5">
                <Check className="h-3.5 w-3.5 text-[#10B981]" />
                No credit card required
              </span>
              <span className="flex items-center gap-1.5">
                <Check className="h-3.5 w-3.5 text-[#10B981]" />
                Free plan forever
              </span>
              <span className="flex items-center gap-1.5">
                <Check className="h-3.5 w-3.5 text-[#10B981]" />
                Cancel anytime
              </span>
            </div>
            </div>
          </div>
        </div>
        <ChatHeroSideDemoColumn side="right" />
      </div>
      </ChatHeroDemoLoopProvider>
    </section>
  );
}
