'use client';

type PricingBillingToggleProps = {
  interval: 'monthly' | 'yearly';
  onIntervalChange: (interval: 'monthly' | 'yearly') => void;
  dark?: boolean;
};

export default function PricingBillingToggle({ interval, onIntervalChange, dark }: PricingBillingToggleProps) {
  void dark;
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="inline-flex items-center gap-2 rounded-full border border-[#f4d9bf] bg-white p-1 shadow-sm">
        <button
          type="button"
          onClick={() => onIntervalChange('monthly')}
          className={`rounded-full px-5 py-2.5 text-sm font-semibold transition-all ${
            interval === 'monthly'
              ? 'gradient-cta-pro text-chrome-text shadow'
              : 'text-[#888780] hover:text-[#4F46E5]'
          }`}
        >
          Monthly
        </button>
        <button
          type="button"
          onClick={() => onIntervalChange('yearly')}
          className={`rounded-full px-5 py-2.5 text-sm font-semibold transition-all ${
            interval === 'yearly'
              ? 'gradient-cta-pro text-chrome-text shadow'
              : 'text-[#888780] hover:text-[#4F46E5]'
          }`}
        >
          Yearly <span className={interval === 'yearly' ? 'text-chrome-text/90' : 'text-[#A78BFA]'}>(Save 20%)</span>
        </button>
      </div>
      <p className="text-sm font-medium text-[#2f9e44]">
        <span className="mr-1 text-[#A78BFA]" aria-hidden>🔥</span>
        2 months free with annual billing
      </p>
    </div>
  );
}
