/** Yearly billing discount (matches PricingBillingToggle copy). */
export const PRICING_YEARLY_DISCOUNT_PERCENT = 20;

function yearlyFromMonthly(monthly: number): {
  yearlyCrossed: number;
  yearly: number;
  savePerYear: number;
} {
  const yearlyCrossed = monthly * 12;
  const yearly = Math.round(yearlyCrossed * (1 - PRICING_YEARLY_DISCOUNT_PERCENT / 100));
  return { yearlyCrossed, yearly, savePerYear: yearlyCrossed - yearly };
}

const standardYearly = yearlyFromMonthly(29);
const proYearly = yearlyFromMonthly(47);

export const STANDARD_PLAN_PRICING = {
  monthly: 29,
  ...standardYearly,
  additionalBrandsMonthly: 5,
  additionalBrandsYearly: 48,
  displayName: 'Standard',
  ctaText: 'Get Standard',
} as const;

export const PRO_PLAN_PRICING = {
  monthly: 47,
  ...proYearly,
  additionalBrandsMonthly: 3,
  additionalBrandsYearly: 29,
  displayName: 'Pro',
  ctaText: 'Get Pro',
} as const;

/** Lowest paid monthly price for meta copy (e.g. layout description). */
export const PRICING_FROM_MONTHLY = STANDARD_PLAN_PRICING.monthly;

export function formatPlanYearlyPrice(plan: 'standard' | 'pro'): string {
  const yearly = plan === 'standard' ? STANDARD_PLAN_PRICING.yearly : PRO_PLAN_PRICING.yearly;
  return `$${yearly}/year`;
}

export function formatPlanMonthlyPrice(plan: 'standard' | 'pro'): string {
  const monthly = plan === 'standard' ? STANDARD_PLAN_PRICING.monthly : PRO_PLAN_PRICING.monthly;
  return `$${monthly}/mo`;
}
