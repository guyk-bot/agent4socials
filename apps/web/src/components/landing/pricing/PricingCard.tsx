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
        className={`relative flex flex-col rounded-[20px] border p-6 sm:p-8 backdrop-blur-[20px] transition-all duration-300 ${
          highlighted
            ? 'border-[#5ff6fd]/40 bg-[rgba(255,255,255,0.06)] shadow-[0_0_30px_rgba(139,92,246,0.5)] scale-[1.02]'
            : 'border-white/[0.08] bg-[rgba(255,255,255,0.05)] hover:border-white/[0.12] hover:shadow-[0_0_20px_rgba(139,92,246,0.2)]'
        }`}
      >
        {badge && (
          <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-[linear-gradient(135deg,#5ff6fd,#df44dc)] px-3 py-1 text-xs font-semibold text-white shadow-[0_0_15px_rgba(139,92,246,0.5)]">
            {badge}
          </div>
        )}
        <h2 className="text-xl font-bold text-white">
          {plan === 'free' ? 'Free' : plan === 'starter' ? 'Starter' : 'Pro'}
        </h2>
        {bestValueLabel && (
          <p className="mt-1 text-sm font-medium text-[#5ff6fd]">{bestValueLabel}</p>
        )}
        <p className="mt-1 text-sm text-[#9ca3af]">{description}</p>
        <div className="mt-6">
          {isFree ? (
            <p className="flex items-baseline gap-1">
              <span className="text-3xl font-bold tracking-tight text-white sm:text-4xl">{freePrice ?? '$0'}</span>
            </p>
          ) : billingInterval === 'monthly' ? (
            <p className="flex items-baseline gap-1">
              <span className="text-3xl font-bold tracking-tight text-white sm:text-4xl">${priceMonthly}</span>
              <span className="text-[#9ca3af]">/ month</span>
            </p>
          ) : (
            <p className="flex items-baseline gap-1">
              <span className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
                ${Math.round((priceYearly ?? 0) / 12)}
              </span>
              <span className="text-[#9ca3af]">/ month</span>
            </p>
          )}
        </div>
        <ul className="mt-6 flex-1 space-y-3">
          {highlights.map((item, i) => (
            <li key={i} className="flex items-start gap-3 text-sm text-[#9ca3af]">
              <Check className="h-5 w-5 shrink-0 text-[#5ff6fd]" aria-hidden />
              <span>{item}</span>
            </li>
          ))}
        </ul>
        {!isFree && (additionalBrandsMonthly != null || additionalBrandsYearly != null) && (
          <div className="mt-4 pt-4 border-t border-white/[0.08]">
            <p className="text-xs font-semibold uppercase tracking-wider text-[#6b7280] mb-1">Add-ons</p>
            <p className="text-sm text-[#9ca3af]">
              {billingInterval === 'monthly'
                ? `+$${additionalBrandsMonthly} / brand monthly`
                : `+$${additionalBrandsYearly} / brand yearly`}
            </p>
          </div>
        )}
        <button
          type="button"
          onClick={onCta}
          className={`mt-8 w-full rounded-full py-3.5 font-semibold text-sm transition-all duration-300 ${
            highlighted
              ? 'bg-[linear-gradient(135deg,#5ff6fd,#8b5cf6,#df44dc)] text-white shadow-[0_0_20px_rgba(139,92,246,0.5)] hover:shadow-[0_0_30px_rgba(139,92,246,0.7)] hover:scale-[1.02]'
              : 'bg-[#6b21a8] text-white hover:bg-[#7c3aed] shadow-[0_0_15px_rgba(107,33,168,0.4)] hover:shadow-[0_0_20px_rgba(124,58,237,0.5)] hover:scale-[1.02]'
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
