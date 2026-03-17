'use client';

type PricingHeroProps = { dark?: boolean };

export default function PricingHero({ dark }: PricingHeroProps) {
  if (dark) {
    return (
      <section className="pt-24 pb-10 sm:pt-28 sm:pb-12">
        <div className="mx-auto max-w-3xl px-4 text-center sm:px-6">
          <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl md:text-4xl">
            Pricing
          </h1>
          <p className="mt-3 text-slate-400">
            Manage your social media, conversations, and bio links in one place. Yearly billing saves 20%.
          </p>
        </div>
      </section>
    );
  }
  return (
    <section className="pt-24 pb-12 sm:pt-28 sm:pb-16">
      <div className="mx-auto max-w-3xl px-4 text-center sm:px-6">
        <h1 className="text-3xl font-bold tracking-tight text-neutral-900 sm:text-4xl md:text-5xl">
          Manage your social media, conversations, and bio links in one place.
        </h1>
        <p className="mt-4 text-lg leading-relaxed text-neutral-600">
          Schedule posts, reply to messages and comments, track analytics, and create smart bio links from one dashboard.
        </p>
      </div>
    </section>
  );
}
