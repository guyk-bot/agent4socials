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
  void dark;

  return (
    <div
      className={`relative flex flex-col rounded-2xl border-2 p-6 sm:p-8 transition-all duration-200 ${
        highlighted
          ? 'border-[#ffb87a] bg-[#fffaf2] shadow-lg shadow-[#ff8a3d]/20'
          : 'border-[#f2e4d4] bg-white shadow-sm hover:border-[#f5c79a] hover:shadow-md'
      }`}
    >
      {badge && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full gradient-cta-pro px-3 py-1 text-xs font-semibold text-white shadow">
          {badge}
        </div>
      )}
      <h2 className="text-xl font-bold text-[#1a161f]">
        {plan === 'free' ? 'Free' : plan === 'starter' ? 'Starter' : 'Pro'}
      </h2>
      {bestValueLabel && (
        <p className="mt-1 text-sm font-medium text-[#c2410c]">{bestValueLabel}</p>
      )}
      <p className="mt-1 text-sm text-[#5d5768]">{description}</p>
      <div className="mt-6">
        {isFree ? (
          <p className="flex items-baseline gap-1">
            <span className="text-3xl font-bold tracking-tight text-[#1a161f] sm:text-4xl">{freePrice ?? '$0'}</span>
          </p>
        ) : billingInterval === 'monthly' ? (
          <p className="flex items-baseline gap-1">
            <span className="text-3xl font-bold tracking-tight text-[#1a161f] sm:text-4xl">${priceMonthly}</span>
            <span className="text-[#756a88]">/ month</span>
          </p>
        ) : (
          <p className="flex items-baseline gap-1">
            <span className="text-3xl font-bold tracking-tight text-[#1a161f] sm:text-4xl">
              ${Math.round((priceYearly ?? 0) / 12)}
            </span>
            <span className="text-[#756a88]">/ month</span>
          </p>
        )}
      </div>
      <ul className="mt-6 flex-1 space-y-3">
        {highlights.map((item, i) => (
          <li key={i} className="flex items-start gap-3 text-sm text-[#473f55]">
            <Check className="h-5 w-5 shrink-0 text-[#2f9e44]" aria-hidden />
            <span>{item}</span>
          </li>
        ))}
      </ul>
      {!isFree && (additionalBrandsMonthly != null || additionalBrandsYearly != null) && (
        <div className="mt-4 pt-4 border-t border-[#f3e3d2]">
          <p className="text-xs font-semibold uppercase tracking-wider text-[#b45309] mb-1">Add-ons</p>
          <p className="text-sm text-[#5d5768]">
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
            ? 'gradient-cta-pro text-white shadow hover:opacity-95 active:scale-[0.98]'
            : isFree
              ? 'border border-[#f2c38d] bg-white text-[#c2410c] hover:border-[#ea580c] hover:bg-[#fff7ed]'
              : 'bg-[#ea580c] text-white shadow hover:bg-[#c2410c] active:scale-[0.98]'
        }`}
      >
        {ctaText}
      </button>
    </div>
  );
}
