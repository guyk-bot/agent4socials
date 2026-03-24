'use client';

type PricingHeroProps = { dark?: boolean };

export default function PricingHero({ dark }: PricingHeroProps) {
  void dark;
  return (
    <section className="pt-20 pb-6 sm:pt-22 sm:pb-8">
      <div className="mx-auto max-w-3xl px-4 text-center sm:px-6">
        <h1 className="text-3xl font-bold tracking-tight text-[#1a161f] sm:text-4xl md:text-5xl">
          Start multiplying your organic growth for free!
        </h1>
      </div>
    </section>
  );
}
