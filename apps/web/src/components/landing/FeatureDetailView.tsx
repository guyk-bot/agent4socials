'use client';

import Link from 'next/link';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import SiteHeader from '@/components/landing/SiteHeader';
import SiteFooter from '@/components/landing/SiteFooter';
import { useAuthModal } from '@/context/AuthModalContext';
import type { FunnelFeaturePage } from '@/lib/funnel-feature-pages';

export default function FeatureDetailView({ page }: { page: FunnelFeaturePage }) {
  const { openSignup } = useAuthModal();

  return (
    <div className="min-h-screen funnel-page bg-[var(--bg-primary)]">
      <SiteHeader />
      <main className="max-w-3xl mx-auto px-4 sm:px-6 pt-24 pb-16">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-sm text-[var(--text-muted)] hover:text-[var(--primary)] mb-8"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to home
        </Link>

        <p className="text-xs font-semibold uppercase tracking-wider text-[var(--primary)] mb-2">
          Feature
        </p>
        <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight text-[var(--text-primary)] mb-3">
          {page.title}
        </h1>
        <p className="text-base sm:text-lg text-[var(--text-muted)] leading-relaxed mb-10">
          {page.tagline}
        </p>

        <div className="space-y-6">
          <section className="rounded-2xl border border-[var(--bg-border)] bg-[var(--bg-surface)] p-6 sm:p-8">
            <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-4">
              {page.capabilities.title}
            </h2>
            <ul className="space-y-3 text-sm sm:text-base text-[var(--text-muted)] leading-relaxed list-disc pl-5">
              {page.capabilities.body.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>

          <section className="rounded-2xl border border-[var(--bg-border)] bg-[var(--bg-surface)] p-6 sm:p-8">
            <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-4">
              {page.limitations.title}
            </h2>
            <ul className="space-y-3 text-sm sm:text-base text-[var(--text-muted)] leading-relaxed list-disc pl-5">
              {page.limitations.body.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>

          {page.plans ? (
            <section className="rounded-2xl border border-[var(--primary)]/25 bg-[var(--primary)]/5 p-6 sm:p-8">
              <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-2">Plans</h2>
              <p className="text-sm sm:text-base text-[var(--text-muted)] leading-relaxed">
                {page.plans}{' '}
                <Link href="/pricing" className="text-[var(--primary)] font-medium hover:underline">
                  See pricing
                </Link>
              </p>
            </section>
          ) : null}
        </div>

        <div className="mt-10 flex flex-col sm:flex-row gap-3">
          <button
            type="button"
            onClick={() => openSignup()}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-[var(--primary)] px-6 py-3 text-sm font-semibold text-white hover:opacity-90 transition-opacity"
          >
            Try for free
            <ArrowRight className="h-4 w-4" />
          </button>
          <Link
            href="/help"
            className="inline-flex items-center justify-center rounded-xl border border-[var(--bg-border)] px-6 py-3 text-sm font-medium text-[var(--text-primary)] hover:bg-[var(--bg-surface)] transition-colors"
          >
            Help center
          </Link>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
