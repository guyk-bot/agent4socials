'use client';

import { useState, useEffect } from 'react';
import { useAuthModal } from '@/context/AuthModalContext';
import SiteHeader from '@/components/landing/SiteHeader';
import SiteFooter from '@/components/landing/SiteFooter';
import {
  PricingHero,
  PricingBillingToggle,
  PricingCard,
  PricingComparisonTable,
  PricingFAQ,
  PricingCTA,
} from '@/components/landing/pricing';
import { PRO_PLAN_PRICING, STANDARD_PLAN_PRICING } from '@/lib/pricing/constants';

const FREE_HIGHLIGHTS = [
  '1 brand',
  '25 scheduled posts / month',
  'Connect Instagram, Facebook, TikTok, YouTube, LinkedIn',
  '30 days analytics',
  '1 smart link page',
  'Limited AI Assistant use',
];

const STANDARD_HIGHLIGHTS = [
  '1 brand included',
  'Unlimited scheduling',
  'Reply to messages and comments',
  'X (Twitter) and LinkedIn connections',
  '6 months analytics',
  'Unlimited AI Assistant use',
  'Export analytics reports (no watermark)',
];

const PRO_HIGHLIGHTS = [
  '1 brand included',
  'Unlimited analytic history',
  'Bulk replies (messages and comments)',
  'Advanced reporting & exports',
  '10 smart link pages',
  'White label',
  'Add team members',
  'Detailed reports',
  'Priority support',
];

export default function PricingPage() {
  const { openSignup } = useAuthModal();
  const [billingInterval, setBillingInterval] = useState<'monthly' | 'yearly'>('monthly');

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('billing') === 'yearly') {
      setBillingInterval('yearly');
    }
  }, []);

  return (
    <div className="min-h-screen bg-white text-[#1a161f]">
      <SiteHeader />
      <main className="relative">
        <div className="min-h-screen">
          <PricingHero />

          <section className="pb-4 sm:pb-5">
            <div className="mx-auto max-w-6xl px-4 sm:px-6">
              <PricingBillingToggle
                interval={billingInterval}
                onIntervalChange={setBillingInterval}
              />
            </div>
          </section>

          <section className="pb-6 sm:pb-8">
            <div className="mx-auto max-w-6xl px-4 sm:px-6">
              <div className="grid gap-4 sm:gap-5 md:grid-cols-2 lg:grid-cols-3 lg:gap-6">
                <PricingCard
                  plan="free"
                  price="$0"
                  description="Best for trying the platform"
                  highlights={FREE_HIGHLIGHTS}
                  ctaText="Start Free"
                  onCta={openSignup}
                  billingInterval={billingInterval}
                />
                <PricingCard
                  plan="starter"
                  description="Best for creators and freelancers"
                  highlights={STANDARD_HIGHLIGHTS}
                  priceMonthly={STANDARD_PLAN_PRICING.monthly}
                  priceYearly={STANDARD_PLAN_PRICING.yearly}
                  yearlyCrossedPrice={STANDARD_PLAN_PRICING.yearlyCrossed}
                  savePerYear={STANDARD_PLAN_PRICING.savePerYear}
                  additionalBrandsMonthly={STANDARD_PLAN_PRICING.additionalBrandsMonthly}
                  additionalBrandsYearly={STANDARD_PLAN_PRICING.additionalBrandsYearly}
                  ctaText={STANDARD_PLAN_PRICING.ctaText}
                  onCta={openSignup}
                  billingInterval={billingInterval}
                />
                <PricingCard
                  plan="pro"
                  description="Best for professionals and agencies"
                  badge="Most Popular"
                  bestValueLabel="⭐ Best value for growing brands"
                  highlights={PRO_HIGHLIGHTS}
                  priceMonthly={PRO_PLAN_PRICING.monthly}
                  priceYearly={PRO_PLAN_PRICING.yearly}
                  yearlyCrossedPrice={PRO_PLAN_PRICING.yearlyCrossed}
                  savePerYear={PRO_PLAN_PRICING.savePerYear}
                  additionalBrandsMonthly={PRO_PLAN_PRICING.additionalBrandsMonthly}
                  additionalBrandsYearly={PRO_PLAN_PRICING.additionalBrandsYearly}
                  additionalAddonUnitLabel="team member"
                  ctaText={PRO_PLAN_PRICING.ctaText}
                  onCta={openSignup}
                  highlighted
                  billingInterval={billingInterval}
                />
              </div>
            </div>
          </section>

          <PricingComparisonTable />
          <PricingFAQ />
          <PricingCTA onStartFree={openSignup} onGetPro={openSignup} />
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
