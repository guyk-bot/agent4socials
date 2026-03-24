'use client';

type PricingHeroProps = { dark?: boolean };

export default function PricingHero({ dark }: PricingHeroProps) {
  void dark;
  return (
    <section className="pt-24 pb-12 sm:pt-28 sm:pb-16">
      <div className="mx-auto max-w-3xl px-4 text-center sm:px-6">
        <p className="mb-3 text-sm font-semibold uppercase tracking-widest text-[#7b2cbf]">Pricing</p>
        <h1 className="text-3xl font-bold tracking-tight text-[#1a161f] sm:text-4xl md:text-5xl">
          Start multiplying your organic growth for free!
        </h1>
      </div>
    </section>
  );
}
