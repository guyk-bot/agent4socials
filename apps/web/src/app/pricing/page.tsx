'use client';

import { useState } from 'react';
import SiteHeader from '@/components/landing/SiteHeader';
import SiteFooter from '@/components/landing/SiteFooter';
import { Check, Sparkles, Users, Building2 } from 'lucide-react';
import { useAuthModal } from '@/context/AuthModalContext';

const CREATOR_FEATURES = [
  '5 social accounts',
  'Scheduling',
  'Basic analytics',
  'Unified inbox',
  '100 DM automations',
  'AI assistant (30 AI generations/month)',
];

const GROWTH_FEATURES = [
  '15 social accounts',
  'Advanced analytics',
  'Full inbox',
  'Keyword automations',
  'Unlimited DM automations',
  'AI assistant (150 AI generations/month)',
  'Performance insights',
];

const AGENCY_FEATURES = [
  'Multiple brands/workspaces',
  'Team members (3 included)',
  'White label',
  'Higher automation limits',
  'AI assistant (500+ generations/month)',
  'Priority support',
];

export default function PricingPage() {
  const { openSignup } = useAuthModal();
  const [yearly, setYearly] = useState(false);

  const creatorPrice = yearly ? 117 : 12;
  const creatorPeriod = yearly ? '/year' : '/month';
  const growthPrice = yearly ? 233 : 24;
  const growthPeriod = yearly ? '/year' : '/month';
  const agencyPrice = yearly ? 573 : 59;
  const agencyPeriod = yearly ? '/year' : '/month';

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <SiteHeader />
      <main className="pt-24 pb-16 sm:pb-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <h1 className="text-center text-3xl font-bold sm:text-4xl md:text-5xl">
            Simple, transparent pricing
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-center text-slate-400 text-sm sm:text-base">
            7-day free trial on any plan. No hidden fees. Cancel anytime.
          </p>

          <div className="mt-8 flex items-center justify-center gap-3">
            <span className={`text-sm font-medium ${!yearly ? 'text-white' : 'text-slate-500'}`}>Monthly</span>
            <button
              type="button"
              role="switch"
              aria-checked={yearly}
              onClick={() => setYearly(!yearly)}
              className="relative inline-flex h-7 w-12 shrink-0 rounded-full bg-slate-700 transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 focus:ring-offset-slate-950"
            >
              <span
                className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform mt-1 ml-1 ${
                  yearly ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
            <span className={`text-sm font-medium ${yearly ? 'text-white' : 'text-slate-500'}`}>Yearly</span>
            <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-xs font-medium text-emerald-400">
              Save 19%
            </span>
          </div>

          <div className="mt-12 grid gap-6 lg:grid-cols-3 lg:gap-8">
            {/* Creator */}
            <div className="relative flex flex-col rounded-2xl border border-slate-700 bg-slate-800/40 p-6 sm:p-8 transition-all hover:border-slate-600 hover:bg-slate-800/60">
              <div className="mb-4 flex items-center gap-2">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-400">
                  <Sparkles className="h-5 w-5" />
                </div>
                <h2 className="text-xl font-bold text-slate-100">Creator</h2>
              </div>
              <p className="text-sm text-slate-400">For solo creators and small businesses.</p>
              <p className="mt-6 flex items-baseline gap-1">
                <span className="text-3xl font-bold sm:text-4xl">${creatorPrice}</span>
                <span className="text-slate-400">{creatorPeriod}</span>
              </p>
              {yearly && <p className="mt-1 text-xs text-slate-500">~${(117 / 12).toFixed(2)}/mo</p>}
              <ul className="mt-6 flex-1 space-y-3">
                {CREATOR_FEATURES.map((f, i) => (
                  <li key={i} className="flex items-center gap-3 text-slate-300 text-sm">
                    <Check className="h-5 w-5 shrink-0 text-emerald-500" />
                    {f}
                  </li>
                ))}
              </ul>
              <button
                type="button"
                onClick={openSignup}
                className="mt-8 w-full rounded-xl border border-slate-600 py-3.5 font-semibold text-white transition hover:bg-slate-700 active:scale-[0.98]"
              >
                Start free trial
              </button>
            </div>

            {/* Growth - Most popular */}
            <div className="relative flex flex-col rounded-2xl border-2 border-sky-500/50 bg-slate-800/60 p-6 sm:p-8 shadow-xl shadow-sky-500/10 transition-all hover:border-sky-500/70">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-sky-500 px-3 py-1 text-xs font-semibold text-white">
                Most popular
              </div>
              <div className="mb-4 flex items-center gap-2">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-500/20 text-sky-400">
                  <Users className="h-5 w-5" />
                </div>
                <h2 className="text-xl font-bold text-slate-100">Growth</h2>
              </div>
              <p className="text-sm text-slate-400">For serious creators and small teams.</p>
              <p className="mt-6 flex items-baseline gap-1">
                <span className="text-3xl font-bold sm:text-4xl">${growthPrice}</span>
                <span className="text-slate-400">{growthPeriod}</span>
              </p>
              {yearly && <p className="mt-1 text-xs text-slate-500">~${(233 / 12).toFixed(2)}/mo</p>}
              <ul className="mt-6 flex-1 space-y-3">
                {GROWTH_FEATURES.map((f, i) => (
                  <li key={i} className="flex items-center gap-3 text-slate-300 text-sm">
                    <Check className="h-5 w-5 shrink-0 text-sky-500" />
                    {f}
                  </li>
                ))}
              </ul>
              <button
                type="button"
                onClick={openSignup}
                className="mt-8 w-full rounded-xl bg-sky-500 py-3.5 font-semibold text-white transition hover:bg-sky-400 active:scale-[0.98]"
              >
                Start free trial
              </button>
            </div>

            {/* Agency */}
            <div className="relative flex flex-col rounded-2xl border border-slate-700 bg-slate-800/40 p-6 sm:p-8 transition-all hover:border-violet-500/40 hover:bg-slate-800/60">
              <div className="mb-4 flex items-center gap-2">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-500/20 text-violet-400">
                  <Building2 className="h-5 w-5" />
                </div>
                <h2 className="text-xl font-bold text-slate-100">Agency</h2>
              </div>
              <p className="text-sm text-slate-400">For agencies and multi-brand teams.</p>
              <p className="mt-6 flex items-baseline gap-1">
                <span className="text-3xl font-bold sm:text-4xl">${agencyPrice}</span>
                <span className="text-slate-400">{agencyPeriod}</span>
              </p>
              {yearly && <p className="mt-1 text-xs text-slate-500">~${(573 / 12).toFixed(2)}/mo</p>}
              <ul className="mt-6 flex-1 space-y-3">
                {AGENCY_FEATURES.map((f, i) => (
                  <li key={i} className="flex items-center gap-3 text-slate-300 text-sm">
                    <Check className="h-5 w-5 shrink-0 text-violet-500" />
                    {f}
                  </li>
                ))}
              </ul>
              <div className="mt-4 rounded-lg bg-slate-900/60 px-3 py-2 text-xs text-slate-400">
                Add-ons: $10 per extra user, $10 per extra brand
              </div>
              <button
                type="button"
                onClick={openSignup}
                className="mt-6 w-full rounded-xl border border-violet-500/50 py-3.5 font-semibold text-violet-300 transition hover:bg-violet-500/10 hover:text-violet-200 active:scale-[0.98]"
              >
                Start free trial
              </button>
            </div>
          </div>

          <p className="mt-10 text-center text-slate-500 text-xs sm:text-sm px-2">
            Secure payment via Stripe. No credit card required for your 7-day free trial.
          </p>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
