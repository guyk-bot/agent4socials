'use client';

import SiteHeader from '@/components/landing/SiteHeader';
import SiteFooter from '@/components/landing/SiteFooter';
import { Check } from 'lucide-react';
import { useAuthModal } from '@/context/AuthModalContext';

const features = [
  '7-day free trial, no credit card required',
  'Schedule to Instagram, YouTube, TikTok, Facebook, Twitter & LinkedIn',
  'One calendar, all platforms',
  'Analytics: views, likes, comments, followers, subscribers',
  'White-label: your logo & colors',
  'Cancel anytime',
];

export default function PricingPage() {
  const { openSignup } = useAuthModal();

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <SiteHeader />
      <main className="pt-24 pb-16 sm:pb-20">
        <div className="mx-auto max-w-5xl px-4 sm:px-6">
          <h1 className="text-center text-3xl font-bold sm:text-4xl md:text-5xl">
            Pricing
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-center text-slate-400 text-sm sm:text-base">
            One plan. 7-day free trial. Launch pricing, lock in this rate.
          </p>

          <div className="mt-10 sm:mt-16 grid gap-6 sm:gap-8 md:grid-cols-2 md:gap-10">
            <div className="rounded-2xl border-2 border-emerald-500/50 bg-slate-800/50 p-6 sm:p-8 md:p-10">
              <p className="text-xs sm:text-sm font-semibold uppercase tracking-wider text-emerald-400">7-day free trial, then</p>
              <p className="mt-3 sm:mt-4 text-3xl sm:text-4xl font-bold">
                $2.99
                <span className="text-lg sm:text-xl font-normal text-slate-400">/month</span>
              </p>
              <p className="mt-1 sm:mt-2 text-slate-400 text-sm">Billed monthly. Cancel anytime.</p>
              <ul className="mt-6 sm:mt-8 space-y-3 sm:space-y-4">
                {features.map((f, i) => (
                  <li key={i} className="flex items-center gap-3 text-slate-300 text-sm sm:text-base">
                    <Check className="h-5 w-5 shrink-0 text-emerald-500" />
                    {f}
                  </li>
                ))}
              </ul>
              <button
                type="button"
                onClick={openSignup}
                className="mt-8 sm:mt-10 block w-full rounded-xl bg-emerald-500 py-3.5 sm:py-4 text-center text-base sm:text-lg font-semibold text-white transition hover:bg-emerald-400 active:scale-[0.98]"
              >
                Start 7-day free trial
              </button>
            </div>

            <div className="rounded-2xl border border-slate-700 bg-slate-800/30 p-6 sm:p-8 md:p-10">
              <div className="flex items-center gap-2">
                <p className="text-xs sm:text-sm font-semibold uppercase tracking-wider text-slate-400">Yearly</p>
                <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-xs font-medium text-emerald-400">
                  Save 44%
                </span>
              </div>
              <p className="mt-3 sm:mt-4 text-3xl sm:text-4xl font-bold">
                $19.99
                <span className="text-lg sm:text-xl font-normal text-slate-400">/year</span>
              </p>
              <p className="mt-1 sm:mt-2 text-slate-400 text-sm">Billed once. ~$1.67/mo.</p>
              <ul className="mt-6 sm:mt-8 space-y-3 sm:space-y-4">
                {features.map((f, i) => (
                  <li key={i} className="flex items-center gap-3 text-slate-300 text-sm sm:text-base">
                    <Check className="h-5 w-5 shrink-0 text-emerald-500" />
                    {f}
                  </li>
                ))}
              </ul>
              <button
                type="button"
                onClick={openSignup}
                className="mt-8 sm:mt-10 block w-full rounded-xl border border-slate-600 py-3.5 sm:py-4 text-center text-base sm:text-lg font-semibold text-white transition hover:bg-slate-700 active:scale-[0.98]"
              >
                Start 7-day free trial
              </button>
            </div>
          </div>

          <p className="mt-8 sm:mt-12 text-center text-slate-500 text-xs sm:text-sm px-2">
            Secure payment via Stripe (coming soon). No credit card required for your 7-day free trial.
          </p>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
