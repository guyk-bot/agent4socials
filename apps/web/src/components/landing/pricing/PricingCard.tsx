'use client';

import { Check } from 'lucide-react';

export type PricingPlan = 'free' | 'starter' | 'pro';

type PricingCardProps = {
  plan: PricingPlan;
  price: string;
  description: string;
  badge?: string;
  highlights: string[];
  additionalBrands?: string;
  ctaText: string;
  onCta: () => void;
  highlighted?: boolean;
};

export default function PricingCard({
  plan,
  price,
  description,
  badge,
  highlights,
  additionalBrands,
  ctaText,
  onCta,
  highlighted = false,
}: PricingCardProps) {
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
      <h2 className="text-xl font-bold text-neutral-900">{plan === 'free' ? 'Free' : plan === 'starter' ? 'Starter' : 'Pro'}</h2>
      <p className="mt-1 text-sm text-neutral-600">{description}</p>
      <p className="mt-6 flex items-baseline gap-1">
        <span className="text-3xl font-bold tracking-tight text-neutral-900 sm:text-4xl">{price}</span>
        {plan !== 'free' && <span className="text-neutral-500">/month</span>}
      </p>
      <ul className="mt-6 flex-1 space-y-3">
        {highlights.map((item, i) => (
          <li key={i} className="flex items-start gap-3 text-sm text-neutral-700">
            <Check className="h-5 w-5 shrink-0 text-emerald-600" aria-hidden />
            <span>{item}</span>
          </li>
        ))}
      </ul>
      {additionalBrands && (
        <p className="mt-4 text-xs text-neutral-500">{additionalBrands}</p>
      )}
      <button
        type="button"
        onClick={onCta}
        className={`mt-8 w-full rounded-xl py-3.5 font-semibold text-sm transition-all duration-200 ${
          highlighted
            ? 'bg-emerald-600 text-white shadow hover:bg-emerald-700 active:scale-[0.98]'
            : plan === 'free'
              ? 'border-2 border-neutral-300 bg-white text-neutral-900 hover:border-neutral-400 hover:bg-neutral-50'
              : 'border-2 border-neutral-900 bg-neutral-900 text-white hover:bg-neutral-800 active:scale-[0.98]'
        }`}
      >
        {ctaText}
      </button>
    </div>
  );
}
