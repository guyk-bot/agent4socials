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
      <div className="inline-flex items-center gap-2 rounded-full border border-[#eadff5] bg-white p-1 shadow-sm">
        <button
          type="button"
          onClick={() => onIntervalChange('yearly')}
          className={`rounded-full px-5 py-2.5 text-sm font-semibold transition-all ${
            interval === 'yearly'
              ? 'bg-[linear-gradient(135deg,#7b2cbf,#e11d48)] text-white shadow'
              : 'text-[#5d5768] hover:text-[#6f2dbd]'
          }`}
        >
          Yearly <span className={interval === 'yearly' ? 'text-white/90' : 'text-[#d7263d]'}>(Save 20%)</span>
        </button>
        <button
          type="button"
          onClick={() => onIntervalChange('monthly')}
          className={`rounded-full px-5 py-2.5 text-sm font-semibold transition-all ${
            interval === 'monthly'
              ? 'bg-[linear-gradient(135deg,#7b2cbf,#e11d48)] text-white shadow'
              : 'text-[#5d5768] hover:text-[#6f2dbd]'
          }`}
        >
          Monthly
        </button>
      </div>
      <p className="text-sm font-medium text-[#2f9e44]">
        <span className="mr-1 text-[#ff3d00]" aria-hidden>🔥</span>
        2 months free with annual billing
      </p>
    </div>
  );
}
