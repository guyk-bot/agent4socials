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
import { CHAT_HERO_LOGO_SRC } from '@/lib/site-brand-assets';
import { trackChatHeroEvent } from '@/lib/chat-hero-analytics';
import { trackProductEvent } from '@/lib/product-analytics';
import {
  matchesInsightsIntent,
  matchesPricingIntent,
  matchesPublishIntent,
} from '@/lib/chat-intent-detection';
import {
  ChatHeroDemoLoopProvider,
  ChatHeroSideDemoColumn,
} from '@/components/landing/funnel-demos/ChatHeroSideDemos';
import {
  CHAT_HERO_PLATFORMS,
  connectRedirectForPlatforms,
  formatPlatformList,
  answerLandingChatQuestion,
  matchPainPointFromText,
  matchPlatformsFromText,
  type ChatHeroPlatformId,
} from '@/lib/chat-hero-script';
import FunnelBrandContextCard from '@/components/landing/FunnelBrandContextCard';
import FunnelConnectedAccountCard from '@/components/landing/FunnelConnectedAccountCard';
import {
  defaultBrandContextDraft,
  funnelBrandContextAddMoreMessage,
  funnelBrandContextIntro,
  funnelBrandContextManualPrompt,
  funnelBrandContextThinkingMessage,
  funnelConnectedSuccessMessage,
  funnelExperienceChoiceMessage,
  funnelMultiPlatformSignupMessage,
  funnelPublishReadyMessage,
  FUNNEL_ACTIONS,
  FUNNEL_OPENING_BODY,
  platformLabelFromId,
  type FunnelActionId,
  type FunnelFlowStep,
} from '@/lib/funnel-chat-flow';
import type { BrandContextRecord } from '@/lib/brand-context-utils';
import { writeHashtagPool } from '@/lib/hashtag-pool';
import { preloadImageUrl } from '@/lib/funnel/preload-image';
import {
  clearFunnelOAuthPending,
  ensureFunnelSession,
  fetchFunnelBrandDraft,
  fetchFunnelConnectionStatus,
  funnelAuthHeaders,
  funnelPlatformFromOAuthSlug,
  FUNNEL_PLATFORM_TO_API,
  persistFunnelBrandDraft,
  persistFunnelChatState,
  readFunnelBrandDraft,
  readFunnelChatState,
  readFunnelOAuthPending,
  retryFunnelOAuthResolve,
  saveFunnelForAppHandoff,
  writeFunnelOAuthPending,
} from '@/lib/funnel-session-client';
import { setFunnelPostAuthRedirect } from '@/lib/funnel-onboarding';
import {
  closeOAuthConnectPopup,
  listenForOAuthComplete,
} from '@/lib/oauth-connect';

type FlowStep = 0 | 1 | 2 | 3;

type RenderBlock =
  | { id: string; kind: 'ai'; text: string; animate?: boolean; prominent?: boolean; isOpening?: boolean }
  | { id: string; kind: 'user_pills'; labels: string[] }
  | { id: string; kind: 'stats'; items: { value: string; label: string }[] }
  | { id: string; kind: 'mock_chat'; user: string; ai: string }
  | { id: string; kind: 'ideas'; items: string[] }
  | { id: string; kind: 'badges'; items: string[] }
  | { id: string; kind: 'action_chips'; actions: FunnelActionId[] }
  | { id: string; kind: 'experience_choice' }
  | { id: string; kind: 'brand_context' }
  | {
      id: string;
      kind: 'connected_account';
      platformId: ChatHeroPlatformId;
      username: string;
      profilePicture?: string | null;
    };

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
const OPENING_BODY = FUNNEL_OPENING_BODY;

/** Typewriter stops after headline; body + platforms appear together when it finishes. */
const OPENING_TYPEWRITER_TEXT = `${OPENING_GREETING}\n${OPENING_HEADLINE}`;

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

function stripUserPillBlocks(blocks: RenderBlock[]): RenderBlock[] {
  return blocks.filter((b) => b.kind !== 'user_pills');
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

const OPENING_PRIMARY =
  'block text-[26px] sm:text-[30px] lg:text-[32px] tracking-[-0.03em] leading-[1.15]';

const OPENING_HEADLINE_SIZE =
  'block text-[21px] sm:text-[26px] lg:text-[32px] tracking-[-0.04em] leading-[1.1] whitespace-nowrap';

/** Chat hero squircle — scaled ~25% above header logo for funnel readability. */
const FUNNEL_AI_AVATAR_BOX = 'h-8 w-8 sm:h-9 sm:w-9 shrink-0 object-contain';
const FUNNEL_AI_CONTENT_INDENT = 'pl-11 sm:pl-12';

function FunnelAiMessageAvatar({ className }: { className?: string }) {
  const boxClass = className ?? FUNNEL_AI_AVATAR_BOX;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={CHAT_HERO_LOGO_SRC}
      alt=""
      className={boxClass}
      aria-hidden
    />
  );
}

function TypingIndicator() {
  return (
    <div className={`flex items-start gap-3 chat-hero-message-enter ${FUNNEL_AI_CONTENT_INDENT}`} aria-label="Thinking">
      <div className="flex items-center gap-1.5 rounded-2xl border border-[var(--chat-hero-border)] bg-[var(--chat-hero-surface)] px-4 py-3">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="h-2 w-2 rounded-full bg-[var(--chat-hero-muted)] animate-bounce"
            style={{ animationDelay: `${i * 160}ms` }}
          />
        ))}
      </div>
    </div>
  );
}

function OpeningAiMessage({
  typewriterActive,
  showFollowUp,
  onHeadlineComplete,
}: {
  typewriterActive?: boolean;
  /** Body line appears in full after headline typewriter finishes. */
  showFollowUp?: boolean;
  onHeadlineComplete?: () => void;
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
      setDisplayed(OPENING_TYPEWRITER_TEXT.slice(0, i));
      if (i >= OPENING_TYPEWRITER_TEXT.length) {
        if (!doneRef.current) {
          doneRef.current = true;
          onHeadlineComplete?.();
        }
        return;
      }
      window.setTimeout(tick, 14);
    };
    const start = window.setTimeout(tick, 40);
    return () => window.clearTimeout(start);
  }, [typewriterActive, onHeadlineComplete]);

  const [greeting, headline] = typewriterActive
    ? getOpeningLineParts(displayed)
    : [OPENING_GREETING, OPENING_HEADLINE];
  const body = showFollowUp ? OPENING_BODY : '';
  const showCursor = !!typewriterActive && displayed.length < OPENING_TYPEWRITER_TEXT.length;
  const activeLine = getActiveOpeningLineIndex(displayed);

  const rows: { key: string; text: string; className: string }[] = [
    {
      key: 'greeting',
      text: greeting,
      className: `${OPENING_PRIMARY} font-medium text-[var(--chat-hero-text)]`,
    },
    {
      key: 'headline',
      text: headline,
      className: `${OPENING_HEADLINE_SIZE} chat-hero-opening-headline-bold mt-1 sm:mt-1.5`,
    },
    {
      key: 'body',
      text: body,
      className:
        'block text-[13px] sm:text-[15px] lg:text-[16px] font-normal leading-[1.5] mt-2.5 sm:whitespace-nowrap',
    },
  ];

  return (
    <div className="flex items-start gap-3 mt-5 sm:mt-7">
      <FunnelAiMessageAvatar className={`${FUNNEL_AI_AVATAR_BOX} mt-1`} />
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
      <FunnelAiMessageAvatar className={`${FUNNEL_AI_AVATAR_BOX} mt-0.5`} />
      <p className="text-[20px] leading-[1.6] text-[var(--chat-hero-text)] whitespace-pre-line flex-1 min-w-0 break-words">
        {typewriter ? (
          <TypewriterText text={text} active={!!typewriterActive} onComplete={onTypewriterComplete} />
        ) : (
          text
        )}
      </p>
    </div>
  );
}

function FunnelConnectingPlatformRow({ platformId }: { platformId: ChatHeroPlatformId }) {
  const Icon = PLATFORM_ICONS[platformId];
  const label = platformLabelFromId(platformId);
  return (
    <div
      className={`mt-3 flex items-center gap-2.5 ${FUNNEL_AI_CONTENT_INDENT} text-[18px] text-[var(--chat-hero-muted)] chat-hero-message-enter`}
    >
      <Icon size={22} />
      <span>Connecting {label}…</span>
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
  animateEnter = true,
  variant = 'compact',
}: {
  label: string;
  selected: boolean;
  disabled?: boolean;
  icon?: React.ReactNode;
  onClick: () => void;
  staggerIndex?: number;
  animateEnter?: boolean;
  variant?: 'compact' | 'tall';
}) {
  const isTall = variant === 'tall';
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      style={{ animationDelay: animateEnter && staggerIndex !== undefined ? `${staggerIndex * 60}ms` : undefined }}
      className={[
        animateEnter ? 'chat-hero-pill-enter' : '',
        'flex w-full flex-col items-center justify-center rounded-lg border p-2.5 transition-all duration-150',
        isTall ? 'min-h-[120px] sm:min-h-[135px] gap-2' : 'h-[100px] sm:h-[115px] gap-2',
        'active:scale-[0.97]',
        selected
          ? 'border-[#7C3AED] bg-[var(--chat-hero-accent-soft)] shadow-[0_0_0_1px_rgba(124,58,237,0.2)]'
          : 'border-[var(--chat-hero-border)] bg-[var(--chat-hero-surface)] hover:border-[#7C3AED]/50 hover:bg-[var(--chat-hero-bg)]',
        disabled ? 'opacity-50 pointer-events-none' : '',
      ].join(' ')}
    >
      {icon ? (
        <span className="flex h-12 w-12 sm:h-[60px] sm:w-[60px] items-center justify-center">{icon}</span>
      ) : null}
      <span
        className={`text-center font-medium leading-snug px-1 ${
          isTall ? 'text-sm sm:text-base' : 'text-xs sm:text-sm'
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

  const [sideDemosReady, setSideDemosReady] = useState(true);

  const [step, setStep] = useState<FlowStep>(0);
  const [blocks, setBlocks] = useState<RenderBlock[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const [busy, setBusy] = useState(false);

  const [selectedPlatforms, setSelectedPlatforms] = useState<ChatHeroPlatformId[]>([]);
  const [pendingAction, setPendingAction] = useState<FunnelActionId | null>(null);
  const oauthReturnHandled = useRef(false);

  const [funnelStep, setFunnelStep] = useState<FunnelFlowStep>('pick_platform');
  const [showPlatformOptions, setShowPlatformOptions] = useState(true);
  const [showOpeningFollowUp, setShowOpeningFollowUp] = useState(true);
  const [showActionOptions, setShowActionOptions] = useState(false);
  const [showExperienceChoice, setShowExperienceChoice] = useState(false);
  const [showBrandContext, setShowBrandContext] = useState(false);
  const [showSignup, setShowSignup] = useState(false);
  const [messageLimited, setMessageLimited] = useState(false);
  const [connectedAccountId, setConnectedAccountId] = useState<string | null>(null);
  const [connectedPlatform, setConnectedPlatform] = useState<ChatHeroPlatformId | null>(null);
  const [connectedUsername, setConnectedUsername] = useState<string | null>(null);
  const [connectedProfilePicture, setConnectedProfilePicture] = useState<string | null>(null);
  const [brandContextManual, setBrandContextManual] = useState(false);
  const [hashtagPoolDraft, setHashtagPoolDraft] = useState('');
  const [brandDraft, setBrandDraft] = useState<BrandContextRecord>(() => readFunnelBrandDraft() ?? {});
  const [typewriterDone, setTypewriterDone] = useState(true);

  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState('');
  const [draftText, setDraftText] = useState('');

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const flowLock = useRef(false);
  const oauthPopupRef = useRef<Window | null>(null);
  const oauthPopupPollRef = useRef<number | null>(null);
  const oauthSessionPollRef = useRef<number | null>(null);
  const oauthConnectTimeoutRef = useRef<number | null>(null);

  const [oauthPopupPending, setOauthPopupPending] = useState(false);

  const awaitingFunnelOAuth =
    !connectedPlatform && selectedPlatforms.length > 0 && (busy || oauthPopupPending);

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
    void ensureFunnelSession().catch(() => {});
    const isOAuthReturn =
      typeof window !== 'undefined' &&
      new URLSearchParams(window.location.search).get('funnel_connected') === '1';
    const restored = readFunnelChatState();
    if (restored?.blocks?.length) {
      const restoredBlocks = restored.blocks as RenderBlock[];
      setBlocks(
        !restored.connectedAccountId && restored.step === 'pick_platform'
          ? stripUserPillBlocks(restoredBlocks)
          : restoredBlocks
      );
      setFunnelStep((restored.step as FunnelFlowStep) || 'pick_platform');
      setConnectedAccountId(restored.connectedAccountId ?? null);
      setConnectedPlatform(restored.connectedPlatform ?? null);
      setConnectedUsername(restored.connectedUsername ?? null);
      setShowPlatformOptions(!restored.connectedAccountId);
      setShowActionOptions(!!restored.connectedAccountId && restored.step === 'connected');
      setShowBrandContext(restored.step === 'brand_context' || restored.step === 'free_chat');
      if (restored.connectedAccountId) {
        oauthReturnHandled.current = true;
      }
      setShowOpeningFollowUp(true);
    } else if (!isOAuthReturn) {
      setBlocks([
        {
          id: blockId('ai'),
          kind: 'ai',
          text: OPENING_TYPEWRITER_TEXT,
          animate: true,
          prominent: true,
          isOpening: true,
        },
      ]);
    }
    setSideDemosReady(true);
  }, []);

  const finishFunnelOAuthConnect = useCallback(
    (accountId: string, platformId: ChatHeroPlatformId, username: string | null, profilePicture?: string | null): boolean => {
      if (oauthReturnHandled.current) return false;
      oauthReturnHandled.current = true;
      setOauthPopupPending(false);
      setBusy(false);
      flowLock.current = false;
      closeOAuthConnectPopup(oauthPopupRef.current);
      oauthPopupRef.current = null;
      if (oauthPopupPollRef.current !== null) {
        window.clearInterval(oauthPopupPollRef.current);
        oauthPopupPollRef.current = null;
      }
      if (oauthConnectTimeoutRef.current !== null) {
        window.clearTimeout(oauthConnectTimeoutRef.current);
        oauthConnectTimeoutRef.current = null;
      }
      clearFunnelOAuthPending();

      setConnectedAccountId(accountId);
      setConnectedPlatform(platformId);
      setConnectedUsername(username);
      setConnectedProfilePicture(profilePicture ?? null);
      setSelectedPlatforms([platformId]);
      setShowPlatformOptions(false);
      setShowActionOptions(false);
      setFunnelStep('brand_context');
      setStep(2);

      window.history.replaceState({}, '', window.location.pathname);
      return true;
    },
    []
  );

  const beginFunnelPostConnectFlow = useCallback(
    async (accountId: string, platformId: ChatHeroPlatformId, username: string | null, profilePicture?: string | null) => {
      if (!finishFunnelOAuthConnect(accountId, platformId, username, profilePicture)) return;

      trackProductEvent('connect_completed', { platform: platformId, guest: true });

      const label = platformLabelFromId(platformId);
      const displayUser = username || 'you';

      setIsTyping(true);
      scrollToLatest();
      await delay(700);

      appendBlocks([
        {
          id: blockId('ai'),
          kind: 'ai',
          text: funnelConnectedSuccessMessage(label, displayUser),
        },
        {
          id: blockId('ai'),
          kind: 'ai',
          text: funnelBrandContextThinkingMessage(),
        },
      ]);
      setIsTyping(true);
      scrollToLatest();

      const snapshot = await fetchFunnelBrandDraft(accountId);
      const draft = snapshot?.draft ?? defaultBrandContextDraft(label, displayUser);
      const resolvedUsername = snapshot?.username ?? displayUser;
      const resolvedPicture = snapshot?.profilePicture ?? profilePicture ?? null;
      const brandIntro =
        snapshot?.brandContextSource === 'manual'
          ? funnelBrandContextManualPrompt()
          : funnelBrandContextIntro();

      let readyPicture: string | null = null;
      if (resolvedPicture?.trim()) {
        const loaded = await preloadImageUrl(resolvedPicture);
        if (loaded) readyPicture = resolvedPicture;
      }

      if (snapshot) {
        setConnectedUsername(resolvedUsername);
        setConnectedProfilePicture(readyPicture);
      }
      setBrandDraft(draft);
      setBrandContextManual(snapshot?.brandContextSource === 'manual');
      setHashtagPoolDraft((snapshot?.hashtagPool ?? []).join(' '));
      persistFunnelBrandDraft(draft);

      setIsTyping(false);
      appendBlocks([
        {
          id: blockId('connected'),
          kind: 'connected_account',
          platformId,
          username: resolvedUsername,
          profilePicture: readyPicture,
        },
      ]);
      scrollToLatest();

      await delay(400);
      setShowBrandContext(true);
      appendBlocks([
        { id: blockId('ai'), kind: 'ai', text: brandIntro },
        { id: blockId('brand'), kind: 'brand_context' },
        { id: blockId('ai'), kind: 'ai', text: funnelBrandContextAddMoreMessage() },
      ]);
      scrollToLatest();
    },
    [appendBlocks, finishFunnelOAuthConnect, scrollToLatest]
  );

  const tryResolveFunnelOAuth = useCallback(async (): Promise<boolean> => {
    if (oauthReturnHandled.current) return true;
    if (typeof window === 'undefined') return false;

    const params = new URLSearchParams(window.location.search);
    const hasUrlHint = params.get('funnel_connected') === '1';
    let accountId = hasUrlHint ? params.get('accountId') : null;
    let platformId = funnelPlatformFromOAuthSlug(hasUrlHint ? params.get('platform') : null);
    let username = hasUrlHint ? params.get('username') : null;
    let profilePicture: string | null = hasUrlHint ? params.get('newPic') : null;

    if (!accountId || !platformId) {
      const status = await fetchFunnelConnectionStatus();
      if (!status) return false;
      accountId = status.connectedAccountId;
      platformId = status.connectedPlatform;
      username = status.connectedUsername;
      profilePicture = status.connectedProfilePicture ?? null;
    }

    await beginFunnelPostConnectFlow(accountId, platformId, username, profilePicture);
    return true;
  }, [beginFunnelPostConnectFlow]);

  const resetFunnelOAuthPending = useCallback(() => {
    clearFunnelOAuthPending();
    setOauthPopupPending(false);
    setBusy(false);
    flowLock.current = false;
    setShowPlatformOptions(true);
    setSelectedPlatforms([]);
    oauthPopupRef.current = null;
    if (oauthConnectTimeoutRef.current !== null) {
      window.clearTimeout(oauthConnectTimeoutRef.current);
      oauthConnectTimeoutRef.current = null;
    }
  }, []);

  const failFunnelOAuthConnect = useCallback(
    (message: string) => {
      const pending = readFunnelOAuthPending();
      trackProductEvent('connect_abandoned', {
        platform: pending?.platform ?? 'unknown',
        guest: true,
        reason: message.slice(0, 120),
      });
      resetFunnelOAuthPending();
      appendBlocks([{ id: blockId('ai'), kind: 'ai', text: message }]);
      scrollToLatest();
    },
    [appendBlocks, resetFunnelOAuthPending, scrollToLatest]
  );

  useEffect(() => {
    if (oauthReturnHandled.current) return;
    const restored = readFunnelChatState();
    if (restored?.connectedAccountId) return;
    const params = new URLSearchParams(window.location.search);
    const funnelError = params.get('funnel_error');
    if (funnelError) {
      window.history.replaceState({}, '', window.location.pathname);
      trackProductEvent('connect_failed', { guest: true, error_type: 'oauth_callback' });
      failFunnelOAuthConnect(funnelError);
      return;
    }
    if (params.get('funnel_connected') === '1') {
      void tryResolveFunnelOAuth();
      return;
    }
    const pendingOAuth = readFunnelOAuthPending();
    if (!pendingOAuth) return;
    setSelectedPlatforms([pendingOAuth.platform]);
    setShowPlatformOptions(false);
    setBusy(true);
    setOauthPopupPending(true);
    flowLock.current = true;
    void retryFunnelOAuthResolve(() => tryResolveFunnelOAuth(), 20, 2000).then((completed) => {
      if (!completed && !oauthReturnHandled.current) {
        failFunnelOAuthConnect(
          'Connection timed out. If you finished login in another window, refresh this page. Otherwise click the platform again to retry.'
        );
      }
    });
  }, [failFunnelOAuthConnect, tryResolveFunnelOAuth]);

  useEffect(() => {
    return listenForOAuthComplete((payload) => {
      const platformId = funnelPlatformFromOAuthSlug(payload.platform);
      if (!payload.accountId || !platformId) return;
      void beginFunnelPostConnectFlow(
        payload.accountId,
        platformId,
        payload.username ?? null,
        payload.profilePicture ?? null
      );
    });
  }, [beginFunnelPostConnectFlow]);

  useEffect(() => {
    if (!awaitingFunnelOAuth) {
      if (oauthSessionPollRef.current !== null) {
        window.clearInterval(oauthSessionPollRef.current);
        oauthSessionPollRef.current = null;
      }
      return;
    }
    oauthSessionPollRef.current = window.setInterval(() => {
      void tryResolveFunnelOAuth();
    }, 1500);
    return () => {
      if (oauthSessionPollRef.current !== null) {
        window.clearInterval(oauthSessionPollRef.current);
        oauthSessionPollRef.current = null;
      }
    };
  }, [awaitingFunnelOAuth, tryResolveFunnelOAuth]);

  useEffect(() => {
    if (!awaitingFunnelOAuth) {
      if (oauthConnectTimeoutRef.current !== null) {
        window.clearTimeout(oauthConnectTimeoutRef.current);
        oauthConnectTimeoutRef.current = null;
      }
      return;
    }
    oauthConnectTimeoutRef.current = window.setTimeout(() => {
      if (oauthReturnHandled.current) return;
      failFunnelOAuthConnect(
        'Connection timed out. If you finished login in another window, refresh this page. Otherwise click the platform again to retry.'
      );
    }, 90_000);
    return () => {
      if (oauthConnectTimeoutRef.current !== null) {
        window.clearTimeout(oauthConnectTimeoutRef.current);
        oauthConnectTimeoutRef.current = null;
      }
    };
  }, [awaitingFunnelOAuth, failFunnelOAuthConnect]);

  useEffect(() => {
    return () => {
      if (oauthPopupPollRef.current !== null) {
        window.clearInterval(oauthPopupPollRef.current);
      }
      if (oauthSessionPollRef.current !== null) {
        window.clearInterval(oauthSessionPollRef.current);
      }
      if (oauthConnectTimeoutRef.current !== null) {
        window.clearTimeout(oauthConnectTimeoutRef.current);
      }
    };
  }, []);

  const handleHeadlineComplete = useCallback(() => {
    setTypewriterDone(true);
    setShowOpeningFollowUp(true);
    setShowPlatformOptions(true);
  }, []);

  const handlePlatformConnect = useCallback(
    async (id: ChatHeroPlatformId) => {
      if (busy || flowLock.current) return;
      if (connectedPlatform && connectedPlatform !== id) {
        appendBlocks([
          { id: blockId('user'), kind: 'user_pills', labels: [platformLabelFromId(id)] },
          { id: blockId('ai'), kind: 'ai', text: funnelMultiPlatformSignupMessage() },
        ]);
        setShowSignup(true);
        setFunnelStep('signup_required');
        saveFunnelForAppHandoff();
        return;
      }
      if (connectedPlatform === id) return;

      flowLock.current = true;
      setBusy(true);
      setShowPlatformOptions(false);
      setSelectedPlatforms([id]);
      setBlocks((prev) => stripUserPillBlocks(prev));
      trackChatHeroEvent('platforms_selected', { platforms: [id] });
      trackProductEvent('connect_started', { platform: id, guest: true });

      try {
        const token = await ensureFunnelSession();
        writeFunnelOAuthPending(id, token);
        const apiPlatform = FUNNEL_PLATFORM_TO_API[id];
        const oauthStartParams = new URLSearchParams({ funnel: '1' });
        if (
          apiPlatform === 'threads' &&
          new URLSearchParams(window.location.search).get('threads_review') === '1'
        ) {
          oauthStartParams.set('force_full_consent', '1');
        }
        const res = await fetch(`/api/social/oauth/${apiPlatform}/start?${oauthStartParams}`, {
          headers: { ...funnelAuthHeaders(), 'X-Funnel-Session': token },
        });
        const data = (await res.json()) as { url?: string; message?: string; redirectUri?: string };
        if (!res.ok || !data.url) {
          throw new Error(data.message || 'Could not start OAuth');
        }
        // Same-tab OAuth is more reliable than popups (www vs izop.ai breaks window.opener).
        window.location.assign(data.url);
      } catch (err: unknown) {
        clearFunnelOAuthPending();
        let msg =
          err && typeof err === 'object' && 'message' in err
            ? String((err as { message: string }).message)
            : 'Connect failed. Please try again.';
        if (/redirect|whitelist|blocked|1349168/i.test(msg)) {
          msg =
            'This platform blocked the connection. In Meta for Developers, whitelist exactly: https://izop.ai/api/social/oauth/[platform]/callback (no www, no trailing slash). Also add the Threads URL under Facebook Login → Valid OAuth Redirect URIs, then Save and wait a few minutes.';
        }
        trackProductEvent('connect_failed', { platform: id, guest: true, error_type: 'oauth_start' });
        appendBlocks([{ id: blockId('ai'), kind: 'ai', text: msg }]);
        setShowPlatformOptions(true);
        setBusy(false);
        flowLock.current = false;
      }
    },
    [appendBlocks, busy, connectedPlatform]
  );

  const handleFunnelAction = useCallback(
    async (actionId: FunnelActionId) => {
      if (busy) return;
      if (actionId === 'publish') {
        trackProductEvent('funnel_publish_attempted', { guest: true });
      } else if (actionId === 'analytics') {
        trackProductEvent('funnel_insights_attempted', { guest: true, source: 'action_chip' });
      }
      const label = FUNNEL_ACTIONS.find((a) => a.id === actionId)?.label ?? actionId;
      setShowActionOptions(false);
      appendBlocks([{ id: blockId('user'), kind: 'user_pills', labels: [label] }]);
      setFunnelStep('experience_choice');
      await playTypingThen(600, async () => {
        appendBlocks([
          { id: blockId('ai'), kind: 'ai', text: funnelExperienceChoiceMessage() },
          { id: blockId('exp'), kind: 'experience_choice' },
        ]);
        setShowExperienceChoice(true);
        setPendingAction(actionId);
      });
    },
    [appendBlocks, busy, playTypingThen]
  );

  const handleContinueInChat = useCallback(async () => {
    setShowExperienceChoice(false);
    setFunnelStep('free_chat');
    if (pendingAction === 'publish') {
      setShowBrandContext(true);
      setFunnelStep('brand_context');
      appendBlocks([
        { id: blockId('ai'), kind: 'ai', text: funnelBrandContextIntro() },
        { id: blockId('brand'), kind: 'brand_context' },
      ]);
      await playTypingThen(400, async () => {
        appendBlocks([{ id: blockId('ai'), kind: 'ai', text: funnelPublishReadyMessage() }]);
      });
    } else if (pendingAction === 'brainstorm') {
      appendBlocks([
        {
          id: blockId('ai'),
          kind: 'ai',
          text: 'Great — tell me your niche or a topic and I will brainstorm post ideas in your brand voice.',
        },
      ]);
    } else {
      appendBlocks([
        {
          id: blockId('ai'),
          kind: 'ai',
          text: 'Ask me anything about your connected account here, or sign in for the full dashboard experience.',
        },
      ]);
    }
  }, [appendBlocks, pendingAction, playTypingThen]);

  const handleContinueInApp = useCallback(() => {
    saveFunnelForAppHandoff();
    setFunnelPostAuthRedirect('/dashboard/aysop-ai');
    setShowSignup(true);
    setFunnelStep('signup_required');
  }, []);

  const handleGoogleSignup = useCallback(async () => {
    setAuthError('');
    setAuthLoading(true);
    saveFunnelForAppHandoff();
    if (connectedAccountId) {
      trackProductEvent('funnel_signin_after_connect', { method: 'google', guest: true });
    } else {
      trackChatHeroEvent('signup_clicked', { method: 'google', source: 'funnel_chat' });
    }
    try {
      setFunnelPostAuthRedirect(connectedAccountId ? '/dashboard/aysop-ai' : connectRedirectForPlatforms(selectedPlatforms));
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
    saveFunnelForAppHandoff();
    if (connectedAccountId) {
      trackProductEvent('funnel_signin_after_connect', { method: 'email', guest: true });
    } else {
      trackChatHeroEvent('signup_clicked', { method: 'email', source: 'funnel_chat' });
    }
    setFunnelPostAuthRedirect(connectedAccountId ? '/dashboard/aysop-ai' : connectRedirectForPlatforms(selectedPlatforms));
    openSignup('funnel_chat');
  }, [connectedAccountId, openSignup, selectedPlatforms]);

  const handleFreeTextSubmit = useCallback(async () => {
    const trimmed = draftText.trim();
    if (!trimmed || busy || isTyping || messageLimited) return;

    setDraftText('');

    const matchedPlatforms = matchPlatformsFromText(trimmed);
    if (
      matchedPlatforms.length === 1 &&
      funnelStep === 'pick_platform' &&
      !connectedAccountId &&
      showPlatformOptions
    ) {
      void handlePlatformConnect(matchedPlatforms[0]);
      return;
    }

    appendBlocks([{ id: blockId('user'), kind: 'user_pills', labels: [trimmed] }]);

    if (matchesPricingIntent(trimmed)) {
      trackProductEvent('funnel_pricing_question', { guest: true });
    }
    if (matchesInsightsIntent(trimmed)) {
      trackProductEvent('funnel_insights_attempted', { guest: true, source: 'free_text' });
    }
    if (matchesPublishIntent(trimmed)) {
      trackProductEvent('funnel_publish_attempted', { guest: true, source: 'free_text' });
    }

    const matchedPain = matchPainPointFromText(trimmed);

    const chatContext = {
      step,
      text: trimmed,
      matchedPlatforms,
      matchedPain,
      selectedPlatformIds: [...new Set([...selectedPlatforms, ...matchedPlatforms])],
      connectedAccountId,
      funnelFlowStep: funnelStep,
      brandContextDraft: brandDraft as Record<string, unknown>,
      hashtagPool: hashtagPoolDraft,
    };

    setBusy(true);
    setIsTyping(true);
    scrollToLatest();

    const minThinkMs = 700;
    let hitLimit = false;
    const [replyText] = await Promise.all([
      (async () => {
        try {
          const res = await fetch('/api/landing/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...funnelAuthHeaders() },
            body: JSON.stringify(chatContext),
          });
          const data = (await res.json()) as {
            text?: string;
            limited?: boolean;
            brandContextUpdate?: BrandContextRecord;
            hashtagPoolUpdate?: string;
          };
          if (data.limited) {
            hitLimit = true;
            setMessageLimited(true);
            setShowSignup(true);
            return {
              text: data.text?.trim() || answerLandingChatQuestion(chatContext),
              brandContextUpdate: null,
              hashtagPoolUpdate: null,
            };
          }
          if (!res.ok) {
            return {
              text: answerLandingChatQuestion(chatContext),
              brandContextUpdate: null,
              hashtagPoolUpdate: null,
            };
          }
          return {
            text:
              typeof data.text === 'string' && data.text.trim()
                ? data.text.trim()
                : answerLandingChatQuestion(chatContext),
            brandContextUpdate: data.brandContextUpdate ?? null,
            hashtagPoolUpdate: data.hashtagPoolUpdate ?? null,
          };
        } catch {
          return {
            text: answerLandingChatQuestion(chatContext),
            brandContextUpdate: null,
            hashtagPoolUpdate: null,
          };
        }
      })(),
      delay(minThinkMs),
    ]);

    const reply = typeof replyText === 'string' ? { text: replyText, brandContextUpdate: null, hashtagPoolUpdate: null } : replyText;

    if (reply.brandContextUpdate && Object.keys(reply.brandContextUpdate).length > 0) {
      setBrandDraft((prev) => {
        const next = { ...prev, ...reply.brandContextUpdate };
        persistFunnelBrandDraft(next);
        return next;
      });
      setShowBrandContext(true);
    }
    if (reply.hashtagPoolUpdate?.trim()) {
      setHashtagPoolDraft(reply.hashtagPoolUpdate.trim());
    }

    setIsTyping(false);
    appendBlocks([
      {
        id: blockId('ai'),
        kind: 'ai',
        text: reply.text,
      },
    ]);
    if (hitLimit) saveFunnelForAppHandoff();
    setBusy(false);
    scrollToLatest();
  }, [
    appendBlocks,
    busy,
    connectedAccountId,
    draftText,
    funnelStep,
    hashtagPoolDraft,
    isTyping,
    messageLimited,
    scrollToLatest,
    brandDraft,
    handlePlatformConnect,
    selectedPlatforms,
    showPlatformOptions,
    step,
  ]);

  useEffect(() => {
    persistFunnelChatState({
      blocks,
      step: funnelStep,
      connectedAccountId,
      connectedPlatform,
      connectedUsername,
    });
  }, [blocks, connectedAccountId, connectedPlatform, connectedUsername, funnelStep]);

  const inputPlaceholder = useMemo(() => {
    if (messageLimited) return 'Sign in to continue chatting in the app…';
    if (showSignup) return 'Ask anything, or use the signup buttons below…';
    if (showBrandContext) return 'Edit brand context above, or describe your post…';
    if (connectedAccountId) return 'Brainstorm, ask for analytics, or describe a post…';
    if (showPlatformOptions) return 'Pick a platform above to connect, or ask a question…';
    return 'Message iZop…';
  }, [connectedAccountId, messageLimited, showBrandContext, showPlatformOptions, showSignup]);

  return (
    <section className="chat-hero relative flex h-[calc(100dvh-0.5rem)] max-h-[calc(100dvh-0.5rem)] flex-col overflow-hidden pt-14 sm:pt-16">
      <ChatHeroDemoLoopProvider active={sideDemosReady}>
      <div className="flex flex-1 min-h-0 w-full max-w-[1920px] mx-auto">
        <ChatHeroSideDemoColumn side="left" visible={sideDemosReady} />
        <div className="flex flex-1 min-h-0 min-w-0 flex-col w-full px-2 sm:px-3 xl:px-4 pt-2 sm:pt-2 pb-3 sm:pb-4">
          <h1 className="sr-only">iZop, your personal AI social media manager</h1>

          <div ref={scrollRef} className="flex flex-1 min-h-0 w-full flex-col overflow-y-auto pb-4 pt-2 sm:pt-3">
            <div className="w-full space-y-3 shrink-0">
              {blocks.map((block, index) => {
                if (block.kind === 'ai') {
                  if (block.isOpening) {
                    return (
                      <OpeningAiMessage
                        key={block.id}
                        typewriterActive={false}
                        showFollowUp={showOpeningFollowUp}
                        onHeadlineComplete={handleHeadlineComplete}
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
                  if (
                    !showPlatformOptions &&
                    selectedPlatforms.length > 0 &&
                    !connectedPlatform &&
                    (busy || oauthPopupPending)
                  ) {
                    return null;
                  }
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
                    <div key={block.id} className={`flex flex-wrap gap-2 chat-hero-message-enter ${FUNNEL_AI_CONTENT_INDENT}`}>
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
                    <div key={block.id} className={`space-y-3 ${FUNNEL_AI_CONTENT_INDENT} chat-hero-message-enter`}>
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
                    <div key={block.id} className={`space-y-2 ${FUNNEL_AI_CONTENT_INDENT} chat-hero-message-enter`}>
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
                if (block.kind === 'action_chips') {
                  return showActionOptions ? (
                    <div key={block.id} className={`grid grid-cols-2 gap-2 ${FUNNEL_AI_CONTENT_INDENT} chat-hero-message-enter`}>
                      {FUNNEL_ACTIONS.map((action) => (
                        <button
                          key={action.id}
                          type="button"
                          disabled={busy}
                          onClick={() => void handleFunnelAction(action.id)}
                          className="rounded-xl border border-[var(--chat-hero-border)] bg-[var(--chat-hero-surface)] px-4 py-3 text-sm font-medium text-[var(--chat-hero-text)] hover:border-[#7C3AED]/50"
                        >
                          {action.label}
                        </button>
                      ))}
                    </div>
                  ) : null;
                }
                if (block.kind === 'experience_choice') {
                  return showExperienceChoice ? (
                    <div key={block.id} className={`flex flex-col sm:flex-row gap-2 ${FUNNEL_AI_CONTENT_INDENT} chat-hero-message-enter`}>
                      <button
                        type="button"
                        onClick={handleContinueInApp}
                        className="rounded-full bg-gradient-to-br from-[#7C3AED] to-[#4F46E5] px-5 py-2.5 text-sm font-medium text-white"
                      >
                        Sign in for web app
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleContinueInChat()}
                        className="rounded-full border border-[var(--chat-hero-border)] px-5 py-2.5 text-sm font-medium text-[var(--chat-hero-text)]"
                      >
                        Continue in chat
                      </button>
                    </div>
                  ) : null;
                }
                if (block.kind === 'connected_account') {
                  const Icon = PLATFORM_ICONS[block.platformId];
                  const cardUsername = connectedUsername ?? block.username;
                  const cardPicture = connectedProfilePicture ?? block.profilePicture;
                  return (
                    <div key={block.id} className={FUNNEL_AI_CONTENT_INDENT}>
                      <FunnelConnectedAccountCard
                        platformId={block.platformId}
                        username={cardUsername}
                        profilePicture={cardPicture}
                        icon={<Icon size={28} />}
                      />
                    </div>
                  );
                }
                if (block.kind === 'brand_context') {
                  return showBrandContext ? (
                    <div key={block.id} className={FUNNEL_AI_CONTENT_INDENT}>
                      <FunnelBrandContextCard
                        draft={brandDraft}
                        onChange={setBrandDraft}
                        manualMode={brandContextManual}
                        hashtagPool={hashtagPoolDraft}
                        onHashtagPoolChange={setHashtagPoolDraft}
                        onSave={() => {
                          persistFunnelBrandDraft(brandDraft);
                          const tags = hashtagPoolDraft
                            .split(/[\s,]+/)
                            .map((t) => t.trim())
                            .filter(Boolean)
                            .map((t) => (t.startsWith('#') ? t : `#${t}`));
                          if (tags.length > 0) writeHashtagPool(tags);
                          setFunnelStep('free_chat');
                          appendBlocks([
                            {
                              id: blockId('ai'),
                              kind: 'ai',
                              text: 'Brand context saved. Tell me what you want to post, or ask me to brainstorm ideas in your voice.',
                            },
                          ]);
                        }}
                        disabled={busy}
                      />
                    </div>
                  ) : null;
                }
                return (
                  <div key={block.id} className={`flex flex-wrap gap-2 ${FUNNEL_AI_CONTENT_INDENT} chat-hero-message-enter`}>
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
              <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3 w-full shrink-0">
                {CHAT_HERO_PLATFORMS.map((platform) => {
                  const Icon = PLATFORM_ICONS[platform.id];
                  const selected = connectedPlatform === platform.id;
                  return (
                    <OptionSquareButton
                      key={platform.id}
                      label={platform.label}
                      selected={selected}
                      disabled={busy}
                      animateEnter={false}
                      icon={<Icon size={38} />}
                      onClick={() => void handlePlatformConnect(platform.id)}
                    />
                  );
                })}
              </div>
            ) : null}
            {!showPlatformOptions &&
            selectedPlatforms[0] &&
            !connectedPlatform &&
            (busy || oauthPopupPending) ? (
              <FunnelConnectingPlatformRow platformId={selectedPlatforms[0]} />
            ) : null}
          </div>

          <div className="shrink-0 border-t border-[var(--chat-hero-border)] pt-3 pb-3">
            <div className="space-y-3">
              {showSignup ? (
                <div className="space-y-3 chat-hero-continue-enter">
                  {authError ? (
                    <p className="text-sm text-red-600">{authError}</p>
                  ) : null}
                  <button
                    type="button"
                    disabled={authLoading}
                    onClick={() => void handleGoogleSignup()}
                    className="btn-google-lime w-full flex items-center justify-center gap-3 rounded-full px-7 py-3.5 text-[19px] font-semibold disabled:cursor-not-allowed"
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
                    className="w-full rounded-full border border-[var(--chat-hero-border)] bg-[var(--chat-hero-bg)] px-7 py-3.5 text-[19px] font-medium text-[var(--chat-hero-muted)] hover:border-[#7C3AED] hover:text-[var(--chat-hero-text)] transition-all"
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
              className="flex w-full items-center gap-2.5 rounded-2xl border border-[var(--chat-hero-border)] bg-[var(--chat-hero-input-bg)] px-3.5 py-2.5 sm:px-5 sm:py-3 shadow-sm focus-within:border-[#7C3AED]/40 focus-within:ring-2 focus-within:ring-[#7C3AED]/15"
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
                disabled={busy || isTyping || messageLimited}
                className="flex-1 min-w-0 bg-transparent text-[19px] text-[var(--chat-hero-text)] placeholder:text-[var(--chat-hero-muted)] outline-none disabled:opacity-50"
                aria-label="Message iZop"
              />
              <button
                type="submit"
                disabled={!draftText.trim() || busy || isTyping}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#7C3AED] to-[#4F46E5] text-white transition-all hover:brightness-110 disabled:opacity-40 disabled:pointer-events-none"
                aria-label="Send message"
              >
                <ArrowUp className="h-5 w-5" />
              </button>
            </form>

            <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 text-xs sm:text-sm text-[var(--chat-hero-muted)] pt-0.5">
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
        <ChatHeroSideDemoColumn side="right" visible={sideDemosReady} />
      </div>
      </ChatHeroDemoLoopProvider>
    </section>
  );
}
