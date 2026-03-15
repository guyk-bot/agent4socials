'use client';

type PricingCTAProps = {
  onStartFree: () => void;
  onGetPro: () => void;
};

export default function PricingCTA({ onStartFree, onGetPro }: PricingCTAProps) {
  return (
    <section className="py-16 sm:py-20">
      <div className="mx-auto max-w-3xl px-4 text-center sm:px-6">
        <div className="rounded-3xl border border-neutral-200 bg-gradient-to-b from-neutral-50 to-white p-8 shadow-sm sm:p-12">
          <h2 className="text-2xl font-bold text-neutral-900 sm:text-3xl">
            Start managing your social media smarter today
          </h2>
          <p className="mt-4 text-neutral-600">
            Everything you need to publish, engage, analyze, and grow — in one place.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <button
              type="button"
              onClick={onStartFree}
              className="w-full rounded-xl border-2 border-neutral-300 bg-white px-8 py-3.5 font-semibold text-neutral-900 transition-all hover:border-neutral-400 hover:bg-neutral-50 sm:w-auto"
            >
              Start Free
            </button>
            <button
              type="button"
              onClick={onGetPro}
              className="w-full rounded-xl bg-emerald-600 px-8 py-3.5 font-semibold text-white shadow-md transition-all hover:bg-emerald-700 sm:w-auto"
            >
              Get Pro
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
