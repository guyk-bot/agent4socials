'use client';

type PricingBillingToggleProps = {
  interval: 'monthly' | 'yearly';
  onIntervalChange: (interval: 'monthly' | 'yearly') => void;
};

export default function PricingBillingToggle({ interval, onIntervalChange }: PricingBillingToggleProps) {
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="inline-flex items-center gap-2 rounded-full border-2 border-neutral-200 bg-white p-1 shadow-sm">
        <button
          type="button"
          onClick={() => onIntervalChange('monthly')}
          className={`rounded-full px-5 py-2.5 text-sm font-semibold transition-all ${
            interval === 'monthly'
              ? 'bg-[var(--primary)] text-neutral-900 shadow'
              : 'text-neutral-600 hover:text-neutral-900'
          }`}
        >
          Monthly
        </button>
        <button
          type="button"
          onClick={() => onIntervalChange('yearly')}
          className={`rounded-full px-5 py-2.5 text-sm font-semibold transition-all ${
            interval === 'yearly'
              ? 'bg-[var(--primary)] text-neutral-900 shadow'
              : 'text-neutral-600 hover:text-neutral-900'
          }`}
        >
          Yearly <span className={interval === 'yearly' ? 'text-neutral-700' : 'text-[var(--secondary)]'}>(Save 20%)</span>
        </button>
      </div>
      <p className="text-sm font-medium text-[var(--secondary)]">
        <span className="mr-1" aria-hidden>🔥</span>
        2 months free with annual billing
      </p>
    </div>
  );
}
