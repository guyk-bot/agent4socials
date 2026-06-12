'use client';

import { useState, useEffect } from 'react';
import { useAuthModal } from '@/context/AuthModalContext';
import SiteHeader from '@/components/landing/SiteHeader';
import SiteFooter from '@/components/landing/SiteFooter';
import {
  PricingHero,
  PricingPlansGrid,
  PricingComparisonTable,
  PricingFAQ,
  PricingCTA,
} from '@/components/landing/pricing';
import { trackProductEvent } from '@/lib/product-analytics';

export default function PricingPage() {
  const { openSignup } = useAuthModal();
  const [billingInterval, setBillingInterval] = useState<'monthly' | 'yearly'>('monthly');

  useEffect(() => {
    trackProductEvent('pricing_page_viewed', { source: 'pricing_page' });
    if (new URLSearchParams(window.location.search).get('billing') === 'yearly') {
      setBillingInterval('yearly');
    }
  }, []);

  return (
    <div className="min-h-screen funnel-page">
      <SiteHeader />
      <main className="relative">
        <div className="min-h-screen">
          <PricingHero />

          <section className="pb-6 sm:pb-8">
            <div className="mx-auto max-w-6xl px-4 sm:px-6">
              <PricingPlansGrid
                billingInterval={billingInterval}
                onBillingIntervalChange={setBillingInterval}
                onPlanCta={(plan) => openSignup(`pricing_page_${plan}`)}
                pricingSource="pricing_page"
                toggleClassName="pb-4 sm:pb-5"
                gridClassName="grid gap-4 sm:gap-5 md:grid-cols-2 lg:grid-cols-3 lg:gap-6"
              />
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
