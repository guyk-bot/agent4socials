'use client';

import { Check } from 'lucide-react';

export type PricingPlan = 'free' | 'starter' | 'pro';

type PricingCardProps = {
  plan: PricingPlan;
  description: string;
  badge?: string;
  highlights: string[];
  ctaText: string;
  onCta: () => void;
  highlighted?: boolean;
  /** Only for free: single price string */
  price?: string;
  /** For starter/pro: monthly price (e.g. 15, 39) */
  priceMonthly?: number;
  /** For starter/pro: yearly price (e.g. 144, 374) */
  priceYearly?: number;
  /** Crossed-out yearly total when yearly selected (e.g. 180, 468) */
  yearlyCrossedPrice?: number;
  /** "Save $X per year" when yearly */
  savePerYear?: number;
  /** +$X / brand when monthly */
  additionalBrandsMonthly?: number;
  /** +$X / brand when yearly */
  additionalBrandsYearly?: number;
  /** e.g. "⭐ Best value for growing brands" */
  bestValueLabel?: string;
  billingInterval: 'monthly' | 'yearly';
  /** Dark theme (for landing/pricing on dark bg) */
  dark?: boolean;
};

export default function PricingCard({
  plan,
  description,
  badge,
  highlights,
  ctaText,
  onCta,
  highlighted = false,
  price: freePrice,
  priceMonthly,
  priceYearly,
  yearlyCrossedPrice,
  savePerYear,
  additionalBrandsMonthly,
  additionalBrandsYearly,
  bestValueLabel,
  billingInterval,
  dark = false,
}: PricingCardProps) {
  const isFree = plan === 'free';

  if (dark) {
    return (
      <div
        className={`relative flex flex-col rounded-2xl border-2 p-6 sm:p-8 transition-all duration-200 ${
          highlighted
            ? 'border-[var(--button)] bg-white/5 shadow-lg shadow-[var(--button)]/20'
            : 'border-white/10 bg-white/5 hover:border-white/20'
        }`}
      >
        {badge && (
          <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-[var(--button)] px-3 py-1 text-xs font-semibold text-white">
            {badge}
          </div>
        )}
        <h2 className="text-xl font-bold text-white">
          {plan === 'free' ? 'Free' : plan === 'starter' ? 'Starter' : 'Pro'}
        </h2>
        {bestValueLabel && (
          <p className="mt-1 text-sm font-medium text-amber-400">{bestValueLabel}</p>
        )}
        <p className="mt-1 text-sm text-slate-400">{description}</p>
        <div className="mt-6">
          {isFree ? (
            <p className="flex items-baseline gap-1">
              <span className="text-3xl font-bold tracking-tight text-white sm:text-4xl">{freePrice ?? '$0'}</span>
            </p>
          ) : billingInterval === 'monthly' ? (
            <p className="flex items-baseline gap-1">
              <span className="text-3xl font-bold tracking-tight text-white sm:text-4xl">${priceMonthly}</span>
              <span className="text-slate-400">/ month</span>
            </p>
          ) : (
            <p className="flex items-baseline gap-1">
              <span className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
                ${Math.round((priceYearly ?? 0) / 12)}
              </span>
              <span className="text-slate-400">/ month</span>
            </p>
          )}
        </div>
        <ul className="mt-6 flex-1 space-y-3">
          {highlights.map((item, i) => (
            <li key={i} className="flex items-start gap-3 text-sm text-slate-300">
              <Check className="h-5 w-5 shrink-0 text-emerald-500" aria-hidden />
              <span>{item}</span>
            </li>
          ))}
        </ul>
        {!isFree && (additionalBrandsMonthly != null || additionalBrandsYearly != null) && (
          <div className="mt-4 pt-4 border-t border-white/10">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">Add-ons</p>
            <p className="text-sm text-slate-400">
              {billingInterval === 'monthly'
                ? `+$${additionalBrandsMonthly} / brand monthly`
                : `+$${additionalBrandsYearly} / brand yearly`}
            </p>
          </div>
        )}
        <button
          type="button"
          onClick={onCta}
          className={`mt-8 w-full rounded-xl py-3.5 font-semibold text-sm transition-all ${
            highlighted
              ? 'bg-[var(--button)] text-white hover:bg-[var(--button-hover)]'
              : isFree
                ? 'border border-white/20 bg-transparent text-white hover:bg-white/10'
                : 'bg-[var(--button)] text-white hover:bg-[var(--button-hover)]'
          }`}
        >
          {ctaText}
        </button>
      </div>
    );
  }

  return (
    <div
      className={`relative flex flex-col rounded-2xl border-2 p-6 sm:p-8 transition-all duration-200 ${
        highlighted
          ? 'border-[var(--secondary)] bg-white shadow-lg shadow-[var(--secondary)]/25'
          : 'border-neutral-200 bg-white shadow-sm hover:border-neutral-300 hover:shadow-md'
      }`}
    >
      {badge && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-[var(--secondary)] px-3 py-1 text-xs font-semibold text-white shadow hover:bg-[var(--secondary-hover)]">
          {badge}
        </div>
      )}
      <h2 className="text-xl font-bold text-neutral-900">
        {plan === 'free' ? 'Free' : plan === 'starter' ? 'Starter' : 'Pro'}
      </h2>
      {bestValueLabel && (
        <p className="mt-1 text-sm font-medium text-amber-800">{bestValueLabel}</p>
      )}
      <p className="mt-1 text-sm text-neutral-700">{description}</p>
      <div className="mt-6">
        {isFree ? (
          <p className="flex items-baseline gap-1">
            <span className="text-3xl font-bold tracking-tight text-neutral-900 sm:text-4xl">{freePrice ?? '$0'}</span>
          </p>
        ) : billingInterval === 'monthly' ? (
          <p className="flex items-baseline gap-1">
            <span className="text-3xl font-bold tracking-tight text-neutral-900 sm:text-4xl">${priceMonthly}</span>
            <span className="text-neutral-600">/ month</span>
          </p>
        ) : (
          <p className="flex items-baseline gap-1">
            <span className="text-3xl font-bold tracking-tight text-neutral-900 sm:text-4xl">
              ${Math.round((priceYearly ?? 0) / 12)}
            </span>
            <span className="text-neutral-600">/ month</span>
          </p>
        )}
      </div>
      <ul className="mt-6 flex-1 space-y-3">
        {highlights.map((item, i) => (
          <li key={i} className="flex items-start gap-3 text-sm text-neutral-800">
            <Check className="h-5 w-5 shrink-0 text-emerald-600" aria-hidden />
            <span>{item}</span>
          </li>
        ))}
      </ul>
      {!isFree && (additionalBrandsMonthly != null || additionalBrandsYearly != null) && (
        <div className="mt-4 pt-4 border-t border-neutral-200">
          <p className="text-xs font-semibold uppercase tracking-wider text-neutral-600 mb-1">Add-ons</p>
          <p className="text-sm text-neutral-700">
            {billingInterval === 'monthly'
              ? `+$${additionalBrandsMonthly} / brand monthly`
              : `+$${additionalBrandsYearly} / brand yearly`}
          </p>
        </div>
      )}
      <button
        type="button"
        onClick={onCta}
        className={`mt-8 w-full rounded-xl py-3.5 font-semibold text-sm transition-all duration-200 ${
          highlighted
            ? 'bg-[var(--secondary)] text-white shadow hover:bg-[var(--secondary-hover)] active:scale-[0.98]'
            : isFree
              ? 'border-2 border-neutral-300 bg-white text-neutral-900 hover:border-neutral-400 hover:bg-neutral-50'
              : 'border-2 border-[var(--primary)] bg-[var(--primary)] text-neutral-900 hover:bg-[var(--primary-hover)] active:scale-[0.98]'
        }`}
      >
        {ctaText}
      </button>
    </div>
  );
}
