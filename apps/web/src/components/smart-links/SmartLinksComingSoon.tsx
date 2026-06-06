'use client';

import React from 'react';
import Link from 'next/link';
import { Link2 } from 'lucide-react';
import { SMART_LINKS_COMING_SOON_LABEL } from '@/lib/smart-links/feature-flag';

export default function SmartLinksComingSoon() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[50vh] px-6 py-16 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-neutral-100 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 mb-5">
        <Link2 size={28} className="text-neutral-500" />
      </div>
      <span className="inline-flex items-center rounded-full border border-[#FA8DDF]/60 bg-[#FA8DDF]/15 px-3 py-1 text-xs font-bold uppercase tracking-wide text-[#e878c8] dark:text-[#ffc8ef] mb-4">
        {SMART_LINKS_COMING_SOON_LABEL}
      </span>
      <h1 className="text-2xl font-bold text-neutral-900 dark:text-neutral-100">Links</h1>
      <p className="mt-2 max-w-md text-sm text-neutral-500 dark:text-neutral-400 leading-relaxed">
        Custom link-in-bio pages are on the way. You will be able to build branded bio links with click analytics here
        soon.
      </p>
      <Link
        href="/dashboard"
        className="mt-8 inline-flex items-center rounded-xl bg-[var(--button)] px-5 py-2.5 text-sm font-medium text-chrome-text hover:bg-[var(--button-hover)] transition-colors"
      >
        Back to Console
      </Link>
    </div>
  );
}
