'use client';

export default function PricingHero() {
  return (
    <section className="pt-24 pb-12 sm:pt-28 sm:pb-16">
      <div className="mx-auto max-w-3xl px-4 text-center sm:px-6">
        <h1 className="text-3xl font-bold tracking-tight text-neutral-900 sm:text-4xl md:text-5xl">
          Manage your social media, conversations, and bio links in one place.
        </h1>
        <p className="mt-4 text-lg leading-relaxed text-neutral-600">
          Schedule posts, reply to messages and comments, track analytics, and create smart bio links from one dashboard.
        </p>
        <p className="mt-6 text-sm text-neutral-500">
          Each plan includes 1 brand. Add more brands anytime.
          <br />
          Each scheduled platform counts as one post.
        </p>
        <p className="mt-2 text-xs text-neutral-400">
          Example: Instagram only = 1 post. Instagram + Facebook + TikTok = 3 posts.
        </p>
      </div>
    </section>
  );
}
