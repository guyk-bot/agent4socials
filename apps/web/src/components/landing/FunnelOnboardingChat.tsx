'use client';

import React, { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  BarChart3,
  Calendar,
  Link2,
  MessageCircle,
  Sparkles,
  Inbox,
  ArrowRight,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useAuthModal } from '@/context/AuthModalContext';
import { BRAND_NAME, SITE_LOGO_DARK_SRC } from '@/lib/site-brand-assets';
import {
  FUNNEL_ONBOARDING_ACTIONS,
  setFunnelPostAuthRedirect,
  type FunnelOnboardingAction,
  type FunnelOnboardingActionId,
} from '@/lib/funnel-onboarding';

type ChatLine = { id: string; role: 'assistant' | 'user'; text: string };

const ACTION_ICONS: Record<FunnelOnboardingActionId, React.ComponentType<{ size?: number; className?: string }>> = {
  connect: Link2,
  brand: Sparkles,
  schedule: Calendar,
  ai: MessageCircle,
  inbox: Inbox,
  analytics: BarChart3,
};

export default function FunnelOnboardingChat() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const { openSignup } = useAuthModal();
  const [lines, setLines] = useState<ChatLine[]>([
    {
      id: 'welcome',
      role: 'assistant',
      text: `Hi, I am ${BRAND_NAME}. What would you like to do first? Pick an option below and we will guide you through onboarding.`,
    },
  ]);
  const [pickedId, setPickedId] = useState<FunnelOnboardingActionId | null>(null);
  const [busy, setBusy] = useState(false);

  const appendLine = useCallback((role: ChatLine['role'], text: string) => {
    setLines((prev) => [...prev, { id: `${role}-${Date.now()}`, role, text }]);
  }, []);

  const startAction = useCallback(
    async (action: FunnelOnboardingAction) => {
      if (busy || pickedId) return;
      setBusy(true);
      setPickedId(action.id);
      appendLine('user', action.label);
      appendLine('assistant', action.assistantReply);

      if (user) {
        router.push(action.redirect);
        setBusy(false);
        return;
      }

      setFunnelPostAuthRedirect(action.redirect);
      setTimeout(() => {
        openSignup();
        setBusy(false);
      }, 450);
    },
    [appendLine, busy, openSignup, pickedId, router, user]
  );

  const showOptions = !pickedId && !authLoading;

  return (
    <div className="relative mx-auto w-full max-w-2xl px-4 sm:px-0">
      <div className="overflow-hidden rounded-2xl border border-[#E8E6DF] bg-white shadow-[0_20px_50px_rgba(124,58,237,0.08)]">
        <div className="flex items-center gap-3 border-b border-[#E8E6DF] bg-[#FAFAFA] px-4 py-3 sm:px-5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={SITE_LOGO_DARK_SRC} alt="" className="h-8 w-8 rounded-lg object-contain" />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-[#1a1a1a]">{BRAND_NAME} onboarding</p>
            <p className="text-xs text-[#888780]">Choose a path to get started</p>
          </div>
        </div>

        <div className="max-h-[min(52vh,420px)] space-y-4 overflow-y-auto px-4 py-5 sm:px-5">
          {lines.map((line) => (
            <div
              key={line.id}
              className={`flex ${line.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[92%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                  line.role === 'user'
                    ? 'bg-[#7C3AED] text-white'
                    : 'border border-[#E8E6DF] bg-[#F8F7FC] text-[#1a1a1a]'
                }`}
              >
                {line.text}
              </div>
            </div>
          ))}
          {pickedId && !user ? (
            <p className="text-center text-xs text-[#888780]">
              Sign in with Google in the modal to continue into your dashboard.
            </p>
          ) : null}
        </div>

        {showOptions ? (
          <div className="border-t border-[#E8E6DF] bg-white px-4 py-4 sm:px-5">
            <p className="mb-3 text-xs font-medium uppercase tracking-wide text-[#888780]">
              Suggested starters
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              {FUNNEL_ONBOARDING_ACTIONS.map((action) => {
                const Icon = ACTION_ICONS[action.id];
                return (
                  <button
                    key={action.id}
                    type="button"
                    disabled={busy}
                    onClick={() => void startAction(action)}
                    className="group flex items-start gap-3 rounded-xl border border-[#E8E6DF] bg-white px-3.5 py-3 text-left transition-all hover:border-[#7C3AED]/40 hover:bg-[#F8F7FC] hover:shadow-sm disabled:opacity-50"
                  >
                    <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#7C3AED]/10 text-[#7C3AED]">
                      <Icon size={16} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1 text-sm font-semibold text-[#1a1a1a]">
                        {action.label}
                        <ArrowRight
                          size={14}
                          className="opacity-0 transition-opacity group-hover:opacity-100 text-[#7C3AED]"
                        />
                      </span>
                      <span className="mt-0.5 block text-xs text-[#888780]">{action.description}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
