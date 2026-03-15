'use client';

type PricingBrandAddonsProps = {
  billingInterval: 'monthly' | 'yearly';
};

export default function PricingBrandAddons({ billingInterval }: PricingBrandAddonsProps) {
  return (
    <section className="mx-auto max-w-6xl px-4 pb-8 sm:px-6">
      <h3 className="text-center text-sm font-semibold uppercase tracking-wider text-neutral-500">
        Brand add-ons
      </h3>
      <div className="mt-4 flex flex-wrap justify-center gap-6 sm:gap-10">
        <div className="rounded-xl border border-neutral-200 bg-white px-5 py-4 shadow-sm">
          <p className="font-semibold text-neutral-900">Starter</p>
          <p className="mt-1 text-sm text-neutral-600">
            {billingInterval === 'monthly' ? '+$5 / brand monthly' : '+$48 / brand yearly'}
          </p>
        </div>
        <div className="rounded-xl border border-neutral-200 bg-white px-5 py-4 shadow-sm">
          <p className="font-semibold text-neutral-900">Pro</p>
          <p className="mt-1 text-sm text-neutral-600">
            {billingInterval === 'monthly' ? '+$3 / brand monthly' : '+$29 / brand yearly'}
          </p>
        </div>
      </div>
    </section>
  );
}
