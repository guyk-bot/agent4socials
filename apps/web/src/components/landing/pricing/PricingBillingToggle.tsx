'use client';

type PricingBillingToggleProps = {
  interval: 'monthly' | 'yearly';
  onIntervalChange: (interval: 'monthly' | 'yearly') => void;
  dark?: boolean;
};

export default function PricingBillingToggle({ interval, onIntervalChange, dark }: PricingBillingToggleProps) {
  if (dark) {
    return (
      <div className="flex flex-col items-center gap-2">
        <div className="inline-flex items-center gap-1 rounded-full border border-white/[0.08] bg-[rgba(255,255,255,0.05)] backdrop-blur-[20px] p-1">
          <button
            type="button"
            onClick={() => onIntervalChange('monthly')}
            className={`rounded-full px-5 py-2.5 text-sm font-semibold transition-all duration-300 ${
              interval === 'monthly'
                ? 'bg-[linear-gradient(135deg,#5ff6fd,#8b5cf6)] text-white shadow-[0_0_15px_rgba(139,92,246,0.4)]'
                : 'text-[#9ca3af] hover:text-white'
            }`}
          >
            Monthly
          </button>
          <button
            type="button"
            onClick={() => onIntervalChange('yearly')}
            className={`rounded-full px-5 py-2.5 text-sm font-semibold transition-all duration-300 ${
              interval === 'yearly'
                ? 'bg-[linear-gradient(135deg,#5ff6fd,#8b5cf6)] text-white shadow-[0_0_15px_rgba(139,92,246,0.4)]'
                : 'text-[#9ca3af] hover:text-white'
            }`}
          >
            Yearly <span className={interval === 'yearly' ? 'text-white/90' : 'text-[#5ff6fd]'}>(Save 20%)</span>
          </button>
        </div>
        <p className="text-sm text-[#9ca3af]">
          2 months free with annual billing
        </p>
      </div>
    );
  }
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="inline-flex items-center gap-2 rounded-full border-2 border-neutral-200 bg-white p-1 shadow-sm">
        <button
          type="button"
          onClick={() => onIntervalChange('monthly')}
          className={`rounded-full px-5 py-2.5 text-sm font-semibold transition-all ${
            interval === 'monthly'
              ? 'bg-[var(--primary)] text-neutral-900 shadow'
              : 'text-neutral-700 hover:text-neutral-900'
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
              : 'text-neutral-700 hover:text-neutral-900'
          }`}
        >
          Yearly <span className={interval === 'yearly' ? 'text-neutral-800' : 'text-[var(--secondary)]'}>(Save 20%)</span>
        </button>
      </div>
      <p className="text-sm font-medium text-[var(--secondary)]">
        <span className="mr-1" aria-hidden>🔥</span>
        2 months free with annual billing
      </p>
    </div>
  );
}
