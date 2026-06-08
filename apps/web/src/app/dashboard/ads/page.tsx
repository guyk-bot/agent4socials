'use client';

import React, { useState } from 'react';
import { Megaphone, Sparkles, Mail, Send, CheckCircle, AlertCircle, X } from 'lucide-react';
import { FacebookIcon, TikTokIcon } from '@/components/SocialPlatformIcons';
import { useAuth } from '@/context/AuthContext';
import api from '@/lib/api';

function GoogleIcon({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden className="shrink-0">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  );
}

const AD_PLATFORMS = [
  {
    id: 'google',
    name: 'Google Ads',
    description: 'Connect Search, Display, and YouTube campaigns to see spend and performance beside your organic posts.',
    icon: <GoogleIcon size={36} />,
    accent: '#4285F4',
  },
  {
    id: 'meta',
    name: 'Meta Ads',
    description: 'Bring Facebook and Instagram ad campaigns into one view with your Page and profile analytics.',
    icon: <FacebookIcon size={36} />,
    accent: '#1877F2',
  },
  {
    id: 'tiktok',
    name: 'TikTok Ads',
    description: 'Link TikTok Ads Manager so promoted video metrics sit next to your organic TikTok content.',
    icon: <TikTokIcon size={36} />,
    accent: '#69C9D0',
  },
] as const;

function AdsFeedbackModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user } = useAuth();
  const [message, setMessage] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) return;
    setStatus('sending');
    setErrorMessage('');
    try {
      await api.post('/support', {
        subject: 'Ads feature feedback',
        message: message.trim(),
      });
      setStatus('success');
      setMessage('');
    } catch (err: unknown) {
      setStatus('error');
      const msg =
        err &&
        typeof err === 'object' &&
        'response' in err &&
        err.response &&
        typeof (err.response as { data?: { message?: string } }).data?.message === 'string'
          ? (err.response as { data: { message: string } }).data.message
          : 'Something went wrong. Please try again.';
      setErrorMessage(msg);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[9000] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="ads-feedback-title"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-lg rounded-2xl border border-[var(--border)] bg-[var(--card-bg)] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-3 top-3 rounded-lg p-2 text-[var(--muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--foreground)]"
          aria-label="Close"
        >
          <X size={18} />
        </button>
        <div className="border-b border-[var(--border)] px-6 py-5">
          <h2 id="ads-feedback-title" className="text-lg font-semibold text-[var(--foreground)] pr-8">
            Tell us what you want from Ads
          </h2>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Share features, integrations, or workflows you would like to see when Ads goes live.
          </p>
        </div>
        <div className="px-6 py-5">
          {status === 'success' ? (
            <div className="flex items-start gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
              <CheckCircle size={18} className="shrink-0 mt-0.5" />
              <span>Thanks for your feedback. We will read every suggestion as we build Ads.</span>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {user?.email ? (
                <p className="text-xs text-[var(--muted)]">
                  Sending as <span className="font-medium text-[var(--foreground)]">{user.email}</span>
                </p>
              ) : null}
              {status === 'error' ? (
                <div className="flex items-start gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                  <AlertCircle size={18} className="shrink-0 mt-0.5" />
                  <span>{errorMessage}</span>
                </div>
              ) : null}
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                required
                rows={5}
                maxLength={10000}
                placeholder="e.g. I want to compare ad spend vs organic reach, pause campaigns from iZop, or see ROAS by platform..."
                className="w-full rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 py-2.5 text-sm text-[var(--foreground)] placeholder:text-[var(--muted)] focus:border-[var(--primary)] focus:outline-none focus:ring-1 focus:ring-[var(--primary)] resize-y min-h-[120px]"
              />
              <div className="flex flex-wrap gap-2 justify-end">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-xl border border-[var(--border)] px-4 py-2.5 text-sm font-medium text-[var(--muted)] hover:bg-[var(--bg-hover)]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={status === 'sending' || !message.trim()}
                  className="inline-flex items-center gap-2 rounded-xl bg-[var(--button)] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[var(--button-hover)] disabled:opacity-50"
                >
                  {status === 'sending' ? 'Sending…' : (
                    <>
                      <Send size={16} />
                      Send feedback
                    </>
                  )}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

export default function AdsComingSoonPage() {
  const [feedbackOpen, setFeedbackOpen] = useState(false);

  return (
    <div className="mx-auto w-full max-w-4xl pb-10">
      <div className="relative overflow-hidden rounded-[24px] border border-[var(--border)] bg-[var(--card-bg)] px-6 py-10 sm:px-10 sm:py-12">
        <div
          className="pointer-events-none absolute inset-0 opacity-80"
          aria-hidden
          style={{
            background:
              'radial-gradient(ellipse 80% 60% at 50% -10%, rgba(124, 58, 237, 0.35) 0%, transparent 55%), radial-gradient(ellipse 50% 40% at 100% 0%, rgba(79, 70, 229, 0.2) 0%, transparent 50%)',
          }}
        />
        <div className="relative text-center">
          <div className="mx-auto mb-5 inline-flex items-center gap-2 rounded-full border border-[var(--color-purple-border)] bg-[var(--color-purple-soft)] px-3 py-1 text-xs font-semibold uppercase tracking-wide text-[var(--color-purple-text)]">
            <Sparkles size={14} />
            In development
          </div>
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--color-purple-soft)] text-[var(--primary)]">
            <Megaphone size={28} />
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-[var(--foreground)] sm:text-4xl">
            Unified ads are on the way
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-base leading-relaxed text-[var(--muted)] sm:text-lg">
            We are building a single place to connect and monitor paid campaigns across Google, Meta, and TikTok,
            right next to your organic social analytics.
          </p>
          <p className="mx-auto mt-3 flex max-w-xl items-center justify-center gap-2 text-sm text-[var(--muted)]">
            <Mail size={16} className="shrink-0 text-[var(--primary)]" />
            We will email existing users as soon as Ads is live.
          </p>
        </div>
      </div>

      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        {AD_PLATFORMS.map((platform) => (
          <div
            key={platform.id}
            className="relative flex flex-col rounded-2xl border border-[var(--border)] bg-[var(--card-bg)] p-5 transition-colors hover:border-[var(--color-purple-border)]"
          >
            <span className="absolute right-3 top-3 rounded-full border border-[var(--color-purple-border)] bg-[var(--color-purple-soft)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--color-purple-text)]">
              Coming soon
            </span>
            <div
              className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl"
              style={{ background: `${platform.accent}18` }}
            >
              {platform.icon}
            </div>
            <h2 className="text-lg font-semibold text-[var(--foreground)]">{platform.name}</h2>
            <p className="mt-2 flex-1 text-sm leading-relaxed text-[var(--muted)]">{platform.description}</p>
            <button
              type="button"
              disabled
              title="Available when Ads launches"
              className="mt-4 w-full rounded-xl border border-[var(--border)] bg-[var(--background)] px-4 py-2.5 text-sm font-semibold text-[var(--muted)] cursor-not-allowed opacity-80"
            >
              Connect {platform.name.replace(' Ads', '')}
            </button>
          </div>
        ))}
      </div>

      <div className="mt-10 rounded-2xl border border-[var(--border)] bg-[var(--card-bg)] px-6 py-8 text-center sm:px-10">
        <h2 className="text-xl font-semibold text-[var(--foreground)]">
          Anything you wish we included in Ads?
        </h2>
        <p className="mx-auto mt-2 max-w-lg text-sm text-[var(--muted)]">
          Your ideas shape what we ship. Tell us what metrics, controls, or workflows matter most for your campaigns.
        </p>
        <button
          type="button"
          onClick={() => setFeedbackOpen(true)}
          className="mt-5 inline-flex items-center gap-2 rounded-full bg-[var(--button)] px-6 py-3 text-sm font-semibold text-white shadow-[0_8px_24px_rgba(124,58,237,0.28)] transition-transform hover:scale-[1.02] hover:bg-[var(--button-hover)] active:scale-[0.98]"
        >
          Share your ideas
        </button>
      </div>

      <AdsFeedbackModal open={feedbackOpen} onClose={() => setFeedbackOpen(false)} />
    </div>
  );
}
