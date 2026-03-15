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
}: PricingCardProps) {
  const isFree = plan === 'free';

  return (
    <div
      className={`relative flex flex-col rounded-2xl border-2 p-6 sm:p-8 transition-all duration-200 ${
        highlighted
          ? 'border-emerald-500/60 bg-emerald-50/50 shadow-lg shadow-emerald-500/10'
          : 'border-neutral-200 bg-white shadow-sm hover:border-neutral-300 hover:shadow-md'
      }`}
    >
      {badge && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-emerald-600 px-3 py-1 text-xs font-semibold text-white shadow">
          {badge}
        </div>
      )}
      <h2 className="text-xl font-bold text-neutral-900">
        {plan === 'free' ? 'Free' : plan === 'starter' ? 'Starter' : 'Pro'}
      </h2>
      {bestValueLabel && (
        <p className="mt-1 text-sm font-medium text-amber-700">{bestValueLabel}</p>
      )}
      <p className="mt-1 text-sm text-neutral-600">{description}</p>

      {/* Price block */}
      <div className="mt-6">
        {isFree ? (
          <p className="flex items-baseline gap-1">
            <span className="text-3xl font-bold tracking-tight text-neutral-900 sm:text-4xl">{freePrice ?? '$0'}</span>
          </p>
        ) : billingInterval === 'monthly' ? (
          <>
            <p className="flex items-baseline gap-1">
              <span className="text-3xl font-bold tracking-tight text-neutral-900 sm:text-4xl">
                ${priceMonthly}
              </span>
              <span className="text-neutral-500">/ month</span>
            </p>
            <p className="mt-1 text-sm text-neutral-500">or ${priceYearly} / year</p>
          </>
        ) : (
          <>
            <p className="flex items-baseline gap-2">
              {yearlyCrossedPrice != null && (
                <span className="text-xl font-medium text-neutral-400 line-through sm:text-2xl">
                  ${yearlyCrossedPrice}
                </span>
              )}
              <span className="text-3xl font-bold tracking-tight text-neutral-900 sm:text-4xl">
                ${priceYearly}
              </span>
            </p>
            <p className="mt-1 text-sm text-neutral-500">billed yearly</p>
            {savePerYear != null && savePerYear > 0 && (
              <p className="mt-2 text-sm font-semibold text-emerald-600">Save ${savePerYear} per year</p>
            )}
          </>
        )}
      </div>

      <ul className="mt-6 flex-1 space-y-3">
        {highlights.map((item, i) => (
          <li key={i} className="flex items-start gap-3 text-sm text-neutral-700">
            <Check className="h-5 w-5 shrink-0 text-emerald-600" aria-hidden />
            <span>{item}</span>
          </li>
        ))}
      </ul>

      {/* Add-ons: additional brands */}
      {!isFree && (additionalBrandsMonthly != null || additionalBrandsYearly != null) && (
        <div className="mt-4 pt-4 border-t border-neutral-100">
          <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500 mb-1">Add-ons</p>
          <p className="text-sm text-neutral-600">
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
            ? 'bg-emerald-600 text-white shadow hover:bg-emerald-700 active:scale-[0.98]'
            : isFree
              ? 'border-2 border-neutral-300 bg-white text-neutral-900 hover:border-neutral-400 hover:bg-neutral-50'
              : 'border-2 border-neutral-900 bg-neutral-900 text-white hover:bg-neutral-800 active:scale-[0.98]'
        }`}
      >
        {ctaText}
      </button>
    </div>
  );
}
