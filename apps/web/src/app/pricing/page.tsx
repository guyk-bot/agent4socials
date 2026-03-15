'use client';

import { useAuthModal } from '@/context/AuthModalContext';
import SiteHeader from '@/components/landing/SiteHeader';
import SiteFooter from '@/components/landing/SiteFooter';
import {
  PricingHero,
  PricingCard,
  PricingComparisonTable,
  PricingFAQ,
  PricingCTA,
} from '@/components/landing/pricing';

const FREE_HIGHLIGHTS = [
  '1 brand',
  '50 scheduled posts / month',
  '30 days analytics',
  '1 smart link page',
  'Limited AI Assistant use',
];

const STARTER_HIGHLIGHTS = [
  '1 brand included',
  'Unlimited scheduling',
  'Reply to messages and comments',
  'X / Twitter and LinkedIn connections',
  '6 months analytics',
  'Unlimited AI Assistant use',
  'Export analytics reports (no watermark)',
];

const PRO_HIGHLIGHTS = [
  '1 brand included',
  'Advanced analytics',
  'Bulk replies (messages and comments)',
  'Keyword triggers',
  '10 smart link pages',
  'Custom domains',
  'White-label reports',
  'Client dashboard',
  'Priority support',
];

export default function PricingPage() {
  const { openSignup } = useAuthModal();

  return (
    <div className="min-h-screen bg-neutral-50">
      <SiteHeader />
      <main className="relative">
        {/* Light content area with subtle background */}
        <div className="min-h-screen">
          <PricingHero />

          {/* Pricing cards */}
          <section className="pb-16 sm:pb-20">
            <div className="mx-auto max-w-6xl px-4 sm:px-6">
              <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 lg:gap-8">
                <PricingCard
                  plan="free"
                  price="$0"
                  description="Best for trying the platform"
                  highlights={FREE_HIGHLIGHTS}
                  additionalBrands="No extra brands"
                  ctaText="Start Free"
                  onCta={openSignup}
                />
                <PricingCard
                  plan="starter"
                  price="$15"
                  description="Best for creators and freelancers"
                  highlights={STARTER_HIGHLIGHTS}
                  additionalBrands="+$5 per additional brand"
                  ctaText="Get Starter"
                  onCta={openSignup}
                />
                <PricingCard
                  plan="pro"
                  price="$39"
                  description="Best for professionals and agencies"
                  badge="Most Popular"
                  highlights={PRO_HIGHLIGHTS}
                  additionalBrands="+$3 per additional brand"
                  ctaText="Get Pro"
                  onCta={openSignup}
                  highlighted
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
