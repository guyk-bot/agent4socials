'use client';

type PricingCTAProps = {
  onStartFree: () => void;
  onGetPro: () => void;
  dark?: boolean;
};

export default function PricingCTA({ onStartFree, onGetPro, dark }: PricingCTAProps) {
  void dark;
  return (
    <section className="py-16 sm:py-20">
      <div className="mx-auto max-w-3xl px-4 text-center sm:px-6">
        <div className="rounded-3xl border border-[rgba(124, 58, 237, 0.2)] bg-gradient-to-b from-[rgba(124, 58, 237, 0.08)] to-white p-8 shadow-sm sm:p-12">
          <h2 className="text-2xl font-bold text-[#1a1a1a] sm:text-3xl">
            Start managing your social media smarter today
          </h2>
          <p className="mt-4 text-[#888780]">
            Everything you need to publish, engage, analyze, and grow, in one place.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <button
              type="button"
              onClick={onStartFree}
              className="w-full rounded-xl border border-[rgba(124, 58, 237, 0.2)] bg-white px-8 py-3.5 font-semibold text-[#4F46E5] transition-all hover:border-[#A78BFA] hover:bg-[rgba(124, 58, 237, 0.08)] sm:w-auto"
            >
              Start Free
            </button>
            <button
              type="button"
              onClick={onGetPro}
              className="w-full rounded-xl gradient-cta-pro px-8 py-3.5 font-semibold text-chrome-text shadow-md transition-all hover:opacity-95 sm:w-auto"
            >
              Get Pro
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
