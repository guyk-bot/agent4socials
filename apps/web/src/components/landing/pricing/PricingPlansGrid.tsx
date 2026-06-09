'use client';

import { PricingBillingToggle, PricingCard } from '@/components/landing/pricing';
import { PRO_PLAN_PRICING, STANDARD_PLAN_PRICING } from '@/lib/pricing/constants';
import {
  FREE_PLAN_HIGHLIGHTS,
  PRO_PLAN_HIGHLIGHTS,
  STANDARD_PLAN_HIGHLIGHTS,
} from '@/lib/pricing/plan-marketing';

type PricingPlansGridProps = {
  billingInterval: 'monthly' | 'yearly';
  onBillingIntervalChange: (interval: 'monthly' | 'yearly') => void;
  onCta: () => void;
  showToggle?: boolean;
  toggleClassName?: string;
  gridClassName?: string;
};

export function PricingPlansGrid({
  billingInterval,
  onBillingIntervalChange,
  onCta,
  showToggle = true,
  toggleClassName = 'pb-8',
  gridClassName = 'grid gap-6 md:grid-cols-2 lg:grid-cols-3 lg:gap-8',
}: PricingPlansGridProps) {
  return (
    <>
      {showToggle ? (
        <div className={toggleClassName}>
          <PricingBillingToggle interval={billingInterval} onIntervalChange={onBillingIntervalChange} />
        </div>
      ) : null}
      <div className={gridClassName}>
        <PricingCard
          plan="free"
          price="$0"
          description="Best for trying the platform"
          highlights={[...FREE_PLAN_HIGHLIGHTS]}
          ctaText="Start Free"
          onCta={onCta}
          billingInterval={billingInterval}
        />
        <PricingCard
          plan="starter"
          description="Best for creators and freelancers"
          highlights={[...STANDARD_PLAN_HIGHLIGHTS]}
          priceMonthly={STANDARD_PLAN_PRICING.monthly}
          priceYearly={STANDARD_PLAN_PRICING.yearly}
          yearlyCrossedPrice={STANDARD_PLAN_PRICING.yearlyCrossed}
          savePerYear={STANDARD_PLAN_PRICING.savePerYear}
          additionalBrandsMonthly={STANDARD_PLAN_PRICING.additionalBrandsMonthly}
          additionalBrandsYearly={STANDARD_PLAN_PRICING.additionalBrandsYearly}
          ctaText={STANDARD_PLAN_PRICING.ctaText}
          onCta={onCta}
          billingInterval={billingInterval}
        />
        <PricingCard
          plan="pro"
          description="Best for professionals and agencies"
          badge="Most Popular"
          bestValueLabel="Best value for growing brands"
          highlights={[...PRO_PLAN_HIGHLIGHTS]}
          priceMonthly={PRO_PLAN_PRICING.monthly}
          priceYearly={PRO_PLAN_PRICING.yearly}
          yearlyCrossedPrice={PRO_PLAN_PRICING.yearlyCrossed}
          savePerYear={PRO_PLAN_PRICING.savePerYear}
          additionalBrandsMonthly={PRO_PLAN_PRICING.additionalBrandsMonthly}
          additionalBrandsYearly={PRO_PLAN_PRICING.additionalBrandsYearly}
          additionalAddonUnitLabel="team member"
          ctaText={PRO_PLAN_PRICING.ctaText}
          onCta={onCta}
          highlighted
          billingInterval={billingInterval}
        />
      </div>
    </>
  );
}
