'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  LifeBuoy,
  MessageSquarePlus,
  Ticket,
  CalendarClock,
  Send,
  CheckCircle,
  AlertCircle,
  Loader2,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import api from '@/lib/api';
import { useAuth } from '@/context/AuthContext';

const SUPPORT_EMAIL = 'guyk@agent4socials.com';

type Tab = 'improve' | 'ticket' | 'zoom';

export type SupportTab = Tab;

export const SUPPORT_TABS: Array<{ id: Tab; label: string; shortLabel: string }> = [
  { id: 'improve', label: 'Help us improve', shortLabel: 'Improve' },
  { id: 'ticket', label: 'Open a ticket', shortLabel: 'Ticket' },
  { id: 'zoom', label: 'Schedule a Zoom call', shortLabel: 'Zoom call' },
];

export function supportTabHref(tab: Tab) {
  return `/help#support-${tab}`;
}

function tabFromHash(hash: string): Tab | null {
  if (hash === '#support-improve') return 'improve';
  if (hash === '#support-ticket' || hash === '#support') return 'ticket';
  if (hash === '#support-zoom') return 'zoom';
  return null;
}

// Zoom availability config (visitor local time).
const DAYS_AHEAD = 21;
const SLOT_MINUTES = 15;
const START_HOUR = 9;
const END_HOUR = 17;

function isWeekday(d: Date) {
  const day = d.getDay();
  return day >= 1 && day <= 5;
}

function buildSlotsForDate(date: Date): Date[] {
  const slots: Date[] = [];
  for (let h = START_HOUR; h < END_HOUR; h += 1) {
    for (let m = 0; m < 60; m += SLOT_MINUTES) {
      slots.push(new Date(date.getFullYear(), date.getMonth(), date.getDate(), h, m, 0, 0));
    }
  }
  return slots;
}

function MessageForm({
  kind,
  onSubmit,
}: {
  kind: 'improve' | 'ticket';
  onSubmit: (subject: string, message: string) => Promise<void>;
}) {
  const { user } = useAuth();
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  const handle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) return;
    setStatus('sending');
    setErrorMessage('');
    try {
      await onSubmit(subject.trim(), message.trim());
      setStatus('success');
      setSubject('');
      setMessage('');
    } catch (err: unknown) {
      setStatus('error');
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        'Something went wrong. Try again or email us directly.';
      setErrorMessage(msg);
    }
  };

  return (
    <form onSubmit={handle} className="max-w-xl space-y-4">
      {status === 'success' && (
        <div className="flex items-center gap-2 rounded-lg bg-green-50 px-4 py-3 text-sm text-green-800 dark:bg-green-950/40 dark:text-green-300">
          <CheckCircle size={18} className="shrink-0" />
          <span>
            {kind === 'improve' ? 'Thanks for the feedback!' : 'Your ticket was sent.'} We will reply
            to {user?.email || 'your email'}.
          </span>
        </div>
      )}
      {status === 'error' && (
        <div className="flex items-start gap-2 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800 dark:bg-red-950/40 dark:text-red-300">
          <AlertCircle size={18} className="mt-0.5 shrink-0" />
          <div>
            <p>{errorMessage}</p>
            <p className="mt-1">
              Or email us:{' '}
              <a href={`mailto:${SUPPORT_EMAIL}`} className="font-medium underline">
                {SUPPORT_EMAIL}
              </a>
            </p>
          </div>
        </div>
      )}
      {user?.email && (
        <div>
          <label className="mb-1 block text-xs font-medium text-[var(--muted)]">From (your account)</label>
          <input
            type="email"
            value={user.email}
            readOnly
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-hover)] px-3 py-2 text-sm text-[var(--muted)]"
          />
        </div>
      )}
      <div>
        <label className="mb-1 block text-xs font-medium text-[var(--muted)]">
          {kind === 'improve' ? 'Title (optional)' : 'Subject (optional)'}
        </label>
        <input
          type="text"
          placeholder={kind === 'improve' ? 'e.g. Add bulk scheduling' : "e.g. Can't connect Instagram"}
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          maxLength={200}
          className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] px-3 py-2 text-sm text-[var(--foreground)] placeholder:text-[var(--muted)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/40"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-[var(--muted)]">
          {kind === 'improve' ? 'What would you like to change or add?' : 'Message'}{' '}
          <span className="text-red-500">*</span>
        </label>
        <textarea
          placeholder={
            kind === 'improve'
              ? 'Tell us what would make iZop better for you...'
              : 'Describe your question or issue...'
          }
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          required
          rows={5}
          maxLength={10000}
          className="min-h-[120px] w-full resize-y rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] px-3 py-2 text-sm text-[var(--foreground)] placeholder:text-[var(--muted)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/40"
        />
      </div>
      <button
        type="submit"
        disabled={status === 'sending' || !message.trim()}
        className="inline-flex items-center gap-2 rounded-lg gradient-cta-pro px-4 py-2.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
      >
        {status === 'sending' ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
        {kind === 'improve' ? 'Send feedback' : 'Send ticket'}
      </button>
    </form>
  );
}

function ZoomScheduler() {
  const { user } = useAuth();
  const timezone = useMemo(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    []
  );

  const weekdays = useMemo(() => {
    const days: Date[] = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    for (let i = 0; i < DAYS_AHEAD; i += 1) {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      if (isWeekday(d)) days.push(d);
    }
    return days;
  }, []);

  const [dayIndex, setDayIndex] = useState(0);
  const [taken, setTaken] = useState<Set<string>>(new Set());
  const [loadingTaken, setLoadingTaken] = useState(true);
  const [selectedSlot, setSelectedSlot] = useState<Date | null>(null);
  const [name, setName] = useState('');
  const [note, setNote] = useState('');
  const [status, setStatus] = useState<'idle' | 'booking' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [confirmed, setConfirmed] = useState<Date | null>(null);

  useEffect(() => {
    if (user?.name && !name) setName(user.name);
  }, [user, name]);

  const refreshTaken = useCallback(async () => {
    setLoadingTaken(true);
    try {
      const res = await api.get<{ taken: Array<{ startIso: string }> }>('/support/bookings');
      setTaken(new Set((res.data.taken ?? []).map((t) => t.startIso)));
    } catch {
      /* leave empty */
    } finally {
      setLoadingTaken(false);
    }
  }, []);

  useEffect(() => {
    void refreshTaken();
  }, [refreshTaken]);

  const selectedDay = weekdays[dayIndex];
  const slots = useMemo(() => (selectedDay ? buildSlotsForDate(selectedDay) : []), [selectedDay]);
  const now = Date.now();

  const book = async () => {
    if (!selectedSlot) return;
    setStatus('booking');
    setErrorMessage('');
    try {
      await api.post('/support/bookings', {
        startIso: selectedSlot.toISOString(),
        name: name.trim() || user?.email || 'Guest',
        email: user?.email ?? '',
        note: note.trim(),
        timezone,
      });
      setConfirmed(selectedSlot);
      setStatus('success');
      setSelectedSlot(null);
      setNote('');
      void refreshTaken();
    } catch (err: unknown) {
      setStatus('error');
      setErrorMessage(
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
          'Could not book that time. Try another slot.'
      );
      void refreshTaken();
    }
  };

  if (confirmed) {
    return (
      <div className="max-w-xl rounded-2xl border border-green-200 bg-green-50 p-6 dark:border-green-900 dark:bg-green-950/40">
        <div className="mb-2 flex items-center gap-2 text-green-800 dark:text-green-300">
          <CheckCircle size={20} />
          <h3 className="font-semibold">Call booked</h3>
        </div>
        <p className="text-sm text-green-800 dark:text-green-300">
          You are set for{' '}
          <strong>
            {confirmed.toLocaleString(undefined, {
              weekday: 'long',
              month: 'long',
              day: 'numeric',
              hour: 'numeric',
              minute: '2-digit',
            })}
          </strong>{' '}
          ({timezone}). We will email a Zoom link to {user?.email || 'your account email'}.
        </p>
        <button
          type="button"
          onClick={() => {
            setConfirmed(null);
            setStatus('idle');
          }}
          className="mt-4 rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] px-4 py-2 text-sm font-medium text-[var(--foreground)] hover:bg-[var(--bg-hover)]"
        >
          Book another time
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-2xl">
      <p className="mb-4 text-sm text-[var(--muted)]">
        Pick a 15 minute slot. Times shown in your timezone ({timezone}).
      </p>

      <div className="mb-4 flex items-center gap-2">
        <button
          type="button"
          onClick={() => setDayIndex((i) => Math.max(0, i - 1))}
          disabled={dayIndex === 0}
          className="rounded-lg border border-[var(--border)] p-2 text-[var(--foreground)] hover:bg-[var(--bg-hover)] disabled:opacity-40"
          aria-label="Previous day"
        >
          <ChevronLeft size={16} />
        </button>
        <div className="min-w-0 flex-1 text-center text-sm font-medium text-[var(--foreground)]">
          {selectedDay
            ? selectedDay.toLocaleDateString(undefined, {
                weekday: 'long',
                month: 'long',
                day: 'numeric',
              })
            : 'No available days'}
        </div>
        <button
          type="button"
          onClick={() => setDayIndex((i) => Math.min(weekdays.length - 1, i + 1))}
          disabled={dayIndex >= weekdays.length - 1}
          className="rounded-lg border border-[var(--border)] p-2 text-[var(--foreground)] hover:bg-[var(--bg-hover)] disabled:opacity-40"
          aria-label="Next day"
        >
          <ChevronRight size={16} />
        </button>
      </div>

      {loadingTaken ? (
        <div className="flex items-center gap-2 py-8 text-sm text-[var(--muted)]">
          <Loader2 size={16} className="animate-spin" /> Loading available times…
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {slots.map((slot) => {
            const iso = slot.toISOString();
            const isPast = slot.getTime() <= now;
            const isTaken = taken.has(iso);
            const isSelected = selectedSlot?.toISOString() === iso;
            const disabled = isPast || isTaken;
            return (
              <button
                key={iso}
                type="button"
                disabled={disabled}
                onClick={() => setSelectedSlot(slot)}
                className={`rounded-lg border px-2 py-2 text-sm transition-colors ${
                  isSelected
                    ? 'border-[var(--primary)] bg-[var(--primary)] text-white'
                    : disabled
                      ? 'cursor-not-allowed border-[var(--border)] text-[var(--muted)] opacity-40'
                      : 'border-[var(--border)] text-[var(--foreground)] hover:border-[var(--primary)] hover:bg-[var(--bg-hover)]'
                }`}
              >
                {slot.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
              </button>
            );
          })}
        </div>
      )}

      {selectedSlot ? (
        <div className="mt-5 rounded-2xl border border-[var(--border)] bg-[var(--bg-surface)] p-4">
          <h3 className="mb-3 font-semibold text-[var(--foreground)]">
            Confirm{' '}
            {selectedSlot.toLocaleString(undefined, {
              weekday: 'short',
              month: 'short',
              day: 'numeric',
              hour: 'numeric',
              minute: '2-digit',
            })}
          </h3>
          {status === 'error' && (
            <div className="mb-3 flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800 dark:bg-red-950/40 dark:text-red-300">
              <AlertCircle size={16} className="mt-0.5 shrink-0" />
              {errorMessage}
            </div>
          )}
          <div className="space-y-3">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] px-3 py-2 text-sm text-[var(--foreground)] placeholder:text-[var(--muted)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/40"
            />
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              placeholder="What would you like to talk about? (optional)"
              className="w-full resize-y rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] px-3 py-2 text-sm text-[var(--foreground)] placeholder:text-[var(--muted)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/40"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => void book()}
                disabled={status === 'booking'}
                className="inline-flex items-center gap-2 rounded-lg gradient-cta-pro px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
              >
                {status === 'booking' ? <Loader2 size={16} className="animate-spin" /> : <CalendarClock size={16} />}
                Book call
              </button>
              <button
                type="button"
                onClick={() => setSelectedSlot(null)}
                className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-medium text-[var(--foreground)] hover:bg-[var(--bg-hover)]"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default function SupportHub({ embedded = false }: { embedded?: boolean }) {
  const [tab, setTab] = useState<Tab>('ticket');

  useEffect(() => {
    const syncFromHash = () => {
      const next = tabFromHash(window.location.hash);
      if (next) setTab(next);
    };
    syncFromHash();
    window.addEventListener('hashchange', syncFromHash);
    return () => window.removeEventListener('hashchange', syncFromHash);
  }, []);

  const selectTab = useCallback((next: Tab) => {
    setTab(next);
    const hash = `#support-${next}`;
    if (window.location.hash !== hash) {
      window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}${hash}`);
    }
  }, []);

  const submitMessage = useCallback(
    async (kind: 'improve' | 'ticket', subject: string, message: string) => {
      const prefix = kind === 'improve' ? '[Feedback] ' : '';
      await api.post('/support', {
        subject: `${prefix}${subject || (kind === 'improve' ? 'Product feedback' : 'Support request')}`,
        message,
      });
    },
    []
  );

  const tabs: Array<{ id: Tab; label: string; icon: React.ReactNode }> = [
    { id: 'improve', label: SUPPORT_TABS[0].label, icon: <MessageSquarePlus size={16} /> },
    { id: 'ticket', label: SUPPORT_TABS[1].label, icon: <Ticket size={16} /> },
    { id: 'zoom', label: SUPPORT_TABS[2].label, icon: <CalendarClock size={16} /> },
  ];

  return (
    <div className={embedded ? 'w-full' : 'mx-auto w-full max-w-5xl'}>
      {!embedded ? (
        <div className="mb-6 flex items-start gap-3">
          <div className="mt-0.5 rounded-xl bg-[var(--primary)]/10 p-2 text-[var(--primary)]">
            <LifeBuoy size={20} />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-[var(--foreground)]">Support</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">How can we help? Choose an option below.</p>
          </div>
        </div>
      ) : null}

      <div className={`${embedded ? 'mt-4' : 'mb-6'} flex flex-col gap-3 sm:flex-row sm:flex-wrap`}>
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => selectTab(t.id)}
            className={`flex flex-1 items-center justify-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors sm:min-w-[140px] ${
              tab === t.id
                ? 'border-[var(--primary)] bg-[var(--primary)]/10 text-[var(--primary)]'
                : 'border-[var(--border)] text-[var(--foreground)] hover:bg-[var(--bg-hover)]'
            }`}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      <div className={embedded ? 'mt-5' : ''}>
        {tab === 'improve' ? (
          <MessageForm kind="improve" onSubmit={(s, m) => submitMessage('improve', s, m)} />
        ) : tab === 'ticket' ? (
          <MessageForm kind="ticket" onSubmit={(s, m) => submitMessage('ticket', s, m)} />
        ) : (
          <ZoomScheduler />
        )}
      </div>
    </div>
  );
}
