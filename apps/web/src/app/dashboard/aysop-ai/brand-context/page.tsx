'use client';

import React, { Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ArrowLeft, Loader2 } from 'lucide-react';
import BrandContextForm from '@/components/brand-context/BrandContextForm';
import { BRAND_NAME } from '@/lib/site-brand-assets';
import { readLastActiveChatId } from '@/lib/ai/aysop-chat-local-cache';
import { useAuth } from '@/context/AuthContext';

function BrandContextContent() {
  const { user } = useAuth();
  const searchParams = useSearchParams();
  const returnChat =
    searchParams.get('c') ?? (user?.id ? readLastActiveChatId(user.id) : null);
  const backHref = returnChat
    ? `/dashboard/aysop-ai?c=${encodeURIComponent(returnChat)}`
    : '/dashboard/aysop-ai';

  return (
    <div className="flex flex-col h-full min-h-0 bg-neutral-950 text-chrome-text">
      <header className="shrink-0 flex items-center gap-3 border-b border-neutral-800 bg-[var(--dark)] px-4 py-3">
        <Link
          href={backHref}
          className="inline-flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm font-medium text-chrome-text/80 hover:bg-white/10 hover:text-chrome-text transition-colors"
        >
          <ArrowLeft size={18} />
          Back to {BRAND_NAME} AI
        </Link>
        <span className="text-neutral-600">|</span>
        <h1 className="text-sm font-semibold">Brand Context</h1>
      </header>
      <div className="flex-1 overflow-y-auto min-h-0">
        <div className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-8 sm:py-8">
          <BrandContextForm variant="full" />
        </div>
      </div>
    </div>
  );
}

function LoadingShell() {
  return (
    <div className="flex items-center justify-center gap-2 h-64 text-neutral-500">
      <Loader2 className="animate-spin" size={22} />
      Loading…
    </div>
  );
}

export default function AysopBrandContextPage() {
  return (
    <Suspense fallback={<LoadingShell />}>
      <BrandContextContent />
    </Suspense>
  );
}
