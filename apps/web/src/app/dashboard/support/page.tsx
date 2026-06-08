'use client';

import React from 'react';
import Link from 'next/link';
import { LifeBuoy, MessageSquarePlus, Ticket, CalendarClock } from 'lucide-react';

/**
 * Support hub with three options: feedback, open a ticket, and book a Zoom call.
 * The individual flows are built in a later phase.
 */
export default function SupportPage() {
  const options = [
    {
      icon: <MessageSquarePlus size={22} />,
      title: 'Help us improve',
      desc: 'Tell us what you would like to change or add.',
    },
    {
      icon: <Ticket size={22} />,
      title: 'Open a ticket',
      desc: 'Report an issue and we will email you back.',
    },
    {
      icon: <CalendarClock size={22} />,
      title: 'Schedule a 15 min Zoom call',
      desc: 'Pick an available time to talk with us.',
    },
  ];
  return (
    <div className="mx-auto w-full max-w-5xl">
      <div className="mb-6 flex items-start gap-3">
        <div className="mt-0.5 rounded-xl bg-[var(--primary)]/10 p-2 text-[var(--primary)]">
          <LifeBuoy size={20} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-[var(--foreground)]">Support</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">How can we help? Choose an option below.</p>
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        {options.map((o) => (
          <div
            key={o.title}
            className="rounded-2xl border border-[var(--border)] bg-[var(--bg-surface)] p-5"
          >
            <div className="mb-3 text-[var(--primary)]">{o.icon}</div>
            <h2 className="font-semibold text-[var(--foreground)]">{o.title}</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">{o.desc}</p>
          </div>
        ))}
      </div>
      <p className="mt-6 text-sm text-[var(--muted)]">
        Need help right now? You can also visit the{' '}
        <Link href="/help" className="text-[var(--primary)] underline">
          help center
        </Link>
        .
      </p>
    </div>
  );
}
