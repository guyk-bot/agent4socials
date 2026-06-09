'use client';

import { useState } from 'react';
import { Check, X } from 'lucide-react';
import { useAuthModal } from '@/context/AuthModalContext';
import { LANDING_PLANS } from '@/lib/pricing/landing-pricing';

export default function LandingPricingSection() {
  const { openSignup } = useAuthModal();
  const [interval, setInterval] = useState<'monthly' | 'yearly'>('monthly');

  return (
    <section id="pricing" className="landing-section landing-section--surface">
      <div className="landing-container">
        <div className="text-center max-w-2xl mx-auto mb-10">
          <h2 className="landing-heading">Plans for every stage</h2>
          <p className="landing-subheading mt-3">Start free. Scale as you grow. No hidden fees.</p>
        </div>

        <div className="flex justify-center mb-10">
          <div className="inline-flex items-center gap-1 rounded-full border border-[#1E1E2A] bg-[#111118] p-1">
            <button
              type="button"
              onClick={() => setInterval('monthly')}
              className={`rounded-full px-5 py-2 text-sm font-semibold transition-all ${
                interval === 'monthly' ? 'bg-[#1E1E2A] text-white' : 'text-[#888780]'
              }`}
            >
              Monthly
            </button>
            <button
              type="button"
              onClick={() => setInterval('yearly')}
              className={`rounded-full px-5 py-2 text-sm font-semibold transition-all flex items-center gap-2 ${
                interval === 'yearly' ? 'bg-[#1E1E2A] text-white' : 'text-[#888780]'
              }`}
            >
              Yearly
              <span className="text-[10px] font-bold uppercase tracking-wide text-[#AAFF45] bg-[#AAFF45]/10 px-2 py-0.5 rounded-full">
                Save 20%
              </span>
            </button>
          </div>
        </div>

        <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-4">
          {LANDING_PLANS.map((plan) => {
            const priceLabel =
              plan.monthly === 0
                ? '$0'
                : interval === 'monthly'
                  ? `$${plan.monthly}`
                  : `$${plan.yearly}`;
            const perLabel = plan.monthly === 0 ? '/month' : interval === 'monthly' ? '/month' : '/year';

            return (
              <div
                key={plan.id}
                className={`landing-pricing-card ${plan.highlighted ? 'landing-pricing-card--highlighted' : ''}`}
              >
                {plan.badge ? (
                  <span className="landing-pricing-badge">{plan.badge}</span>
                ) : null}
                <h3 className="text-lg font-semibold text-white">{plan.name}</h3>
                <p className="text-sm text-[#888780] mt-1">{plan.subtitle}</p>
                <div className="mt-6 flex items-baseline gap-1">
                  <span className="text-[48px] font-bold text-white leading-none">{priceLabel}</span>
                  <span className="text-lg text-[#888780]">{perLabel}</span>
                </div>
                <ul className="mt-6 space-y-3 flex-1">
                  {plan.features.map((f) => (
                    <li key={f.text} className="flex items-start gap-2 text-sm">
                      {f.included ? (
                        <Check className="h-4 w-4 shrink-0 text-[#AAFF45] mt-0.5" />
                      ) : (
                        <X className="h-4 w-4 shrink-0 text-[#2A2A38] mt-0.5" />
                      )}
                      <span className={f.included ? 'text-white' : 'text-[#444440]'}>{f.text}</span>
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  onClick={openSignup}
                  className={`mt-8 w-full rounded-full py-3 text-sm font-semibold transition-all ${
                    plan.ctaStyle === 'link'
                      ? 'text-[#AAFF45] hover:underline bg-transparent'
                      : plan.ctaStyle === 'secondary'
                        ? 'bg-[#1E1E2A] border border-[#2A2A38] text-white hover:border-[#3A3A48]'
                        : plan.ctaStyle === 'gradient'
                          ? 'bg-gradient-to-br from-[#7C3AED] to-[#4F46E5] text-white hover:brightness-110'
                          : 'btn-funnel-lime-cta'
                  }`}
                >
                  {plan.cta}
                </button>
              </div>
            );
          })}
        </div>

        <p className="mt-10 text-center text-sm text-[#888780]">
          Need more brands? +$15/brand/month on any plan.
        </p>
      </div>
    </section>
  );
}
