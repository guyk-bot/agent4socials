'use client';

type PricingHeroProps = { dark?: boolean };

export default function PricingHero({ dark }: PricingHeroProps) {
  void dark;
  return (
    <section className="pt-24 pb-12 sm:pt-28 sm:pb-16">
      <div className="mx-auto max-w-3xl px-4 text-center sm:px-6">
        <h1 className="text-3xl font-bold tracking-tight text-[#1a161f] sm:text-4xl md:text-5xl">
          Manage your social media, conversations, and bio links in one place.
        </h1>
        <p className="mt-4 text-lg leading-relaxed text-[#5d5768]">
          Schedule posts, reply to messages and comments, track analytics, and create smart bio links from one dashboard.
        </p>
      </div>
    </section>
  );
}
