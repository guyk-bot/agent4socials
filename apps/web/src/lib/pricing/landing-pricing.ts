/** Marketing pricing tiers for the landing page (display only). */

export const LANDING_PRICING_YEARLY_DISCOUNT_PERCENT = 20;

export type LandingPlanId = 'free' | 'starter' | 'pro' | 'agency';

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
  ctaStyle: 'link' | 'secondary' | 'gradient' | 'lime';
  highlighted?: boolean;
  features: LandingPlanFeature[];
};

export const LANDING_PLANS: LandingPlan[] = [
  {
    id: 'free',
    name: 'Free',
    subtitle: 'Try iZop risk-free',
    monthly: 0,
    yearly: 0,
    cta: 'Start for free',
    ctaStyle: 'link',
    features: [
      { text: '1 brand', included: true },
      { text: '3 platforms', included: true },
      { text: '30 scheduled posts / month', included: true },
      { text: '30 days analytics', included: true },
      { text: 'Limited iZop AI (10 messages/month)', included: true },
      { text: 'Bulk replies', included: false },
      { text: 'Lead extraction', included: false },
      { text: 'Team members', included: false },
    ],
  },
  {
    id: 'starter',
    name: 'Starter',
    subtitle: 'Perfect for solo creators',
    monthly: 19,
    yearly: 182,
    cta: 'Get Starter',
    ctaStyle: 'secondary',
    features: [
      { text: '1 brand', included: true },
      { text: 'All 8 platforms', included: true },
      { text: 'Unlimited scheduling', included: true },
      { text: '90 days analytics', included: true },
      { text: 'Extended iZop AI (100 messages/month)', included: true },
      { text: 'Reply to comments and DMs', included: true },
      { text: 'Export analytics reports', included: true },
      { text: 'Bulk replies', included: false },
      { text: 'Lead extraction', included: false },
      { text: 'Team members', included: false },
    ],
  },
  {
    id: 'pro',
    name: 'Pro',
    subtitle: 'For serious creators and agencies',
    monthly: 49,
    yearly: 470,
    badge: 'Most popular',
    cta: 'Get Pro',
    ctaStyle: 'gradient',
    highlighted: true,
    features: [
      { text: '3 brands', included: true },
      { text: 'All 8 platforms', included: true },
      { text: 'Unlimited scheduling', included: true },
      { text: 'Unlimited analytics history', included: true },
      { text: 'Unlimited iZop AI', included: true },
      { text: 'Bulk reply to comments and DMs', included: true },
      { text: 'Lead extraction → spreadsheet export', included: true },
      { text: 'Team performance reports', included: true },
      { text: 'White label ready', included: true },
      { text: 'Add team members (+$5/member/month)', included: true },
      { text: 'Priority support', included: true },
    ],
  },
  {
    id: 'agency',
    name: 'Agency',
    subtitle: 'Built for agencies and teams',
    monthly: 99,
    yearly: 950,
    cta: 'Get Agency',
    ctaStyle: 'lime',
    features: [
      { text: '10 brands', included: true },
      { text: 'All 8 platforms', included: true },
      { text: 'Everything in Pro', included: true },
      { text: 'Full white label', included: true },
      { text: 'Unlimited team members', included: true },
      { text: 'Custom AI brand voice per brand', included: true },
      { text: 'Client reporting dashboard', included: true },
      { text: 'Dedicated support', included: true },
      { text: 'API access (coming soon)', included: true },
    ],
  },
];
