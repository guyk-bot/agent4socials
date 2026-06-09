/**
 * @deprecated Use lib/pricing/constants.ts + lib/pricing/plan-marketing.ts + PricingPlansGrid.
 * Kept for type compatibility only. Product pricing is Free, Standard ($29/mo), Pro ($47/mo).
 */

import { PRO_PLAN_PRICING, STANDARD_PLAN_PRICING } from './constants';

export const LANDING_PRICING_YEARLY_DISCOUNT_PERCENT = 20;

export type LandingPlanId = 'free' | 'standard' | 'pro';

export type LandingPlanFeature = {
  text: string;
  included: boolean;
};

export type LandingPlan = {
  id: LandingPlanId;
  name: string;
  subtitle: string;
  monthly: number;
  yearly: number;
  badge?: string;
  cta: string;
  highlighted?: boolean;
  features: LandingPlanFeature[];
};

/** Three plans only (not the experimental four-tier Agency layout). */
export const LANDING_PLANS: LandingPlan[] = [
  {
    id: 'free',
    name: 'Free',
    subtitle: 'Best for trying the platform',
    monthly: 0,
    yearly: 0,
    cta: 'Start Free',
    features: [
      { text: '1 brand', included: true },
      { text: '25 scheduled posts / month', included: true },
      { text: '30 days analytics', included: true },
      { text: 'Limited AI Assistant use', included: true },
    ],
  },
  {
    id: 'standard',
    name: 'Standard',
    subtitle: 'Best for creators and freelancers',
    monthly: STANDARD_PLAN_PRICING.monthly,
    yearly: STANDARD_PLAN_PRICING.yearly,
    cta: STANDARD_PLAN_PRICING.ctaText,
    features: [
      { text: 'Unlimited scheduling', included: true },
      { text: 'Reply to messages and comments', included: true },
      { text: '6 months analytics', included: true },
      { text: 'Unlimited AI Assistant use', included: true },
    ],
  },
  {
    id: 'pro',
    name: 'Pro',
    subtitle: 'Best for professionals and agencies',
    monthly: PRO_PLAN_PRICING.monthly,
    yearly: PRO_PLAN_PRICING.yearly,
    badge: 'Most Popular',
    cta: PRO_PLAN_PRICING.ctaText,
    highlighted: true,
    features: [
      { text: 'Unlimited analytic history', included: true },
      { text: 'Bulk replies', included: true },
      { text: 'White label', included: true },
      { text: 'Add team members', included: true },
      { text: 'Priority support', included: true },
    ],
  },
];
