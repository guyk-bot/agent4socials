import Link from 'next/link';
import Image from 'next/image';
import SiteHeader from '@/components/landing/SiteHeader';
import SiteFooter from '@/components/landing/SiteFooter';
import {
  Calendar,
  BarChart3,
  Instagram,
  Youtube,
  Facebook,
  Linkedin,
  Zap,
  Check,
  ArrowRight,
  Link2,
  CalendarCheck,
  BarChart2,
  HelpCircle,
} from 'lucide-react';

function TikTokIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z" />
    </svg>
  );
}

export default function Home() {
  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <SiteHeader />
      <main>
        {/* Hero */}
        <section className="relative overflow-hidden pt-24 pb-16 sm:pt-32 sm:pb-20 md:pt-36 md:pb-28">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(16,185,129,0.15),transparent)]" />
          <div className="absolute inset-0 bg-gradient-to-b from-emerald-500/5 via-transparent to-transparent" />
          <div className="absolute top-1/4 left-1/4 h-[28rem] w-[28rem] rounded-full bg-emerald-500/15 blur-3xl" />
          <div className="absolute bottom-1/4 right-1/4 h-80 w-80 rounded-full bg-sky-500/10 blur-3xl" />
          <div className="absolute inset-0 bg-[linear-gradient(to_right,#334155_0.5px,transparent_0.5px),linear-gradient(to_bottom,#334155_0.5px,transparent_0.5px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_80%_at_50%_0%,#000_70%,transparent_110%)]" />
          <div className="relative mx-auto max-w-5xl px-4 text-center sm:px-6">
            <div className="mb-6 sm:mb-8 inline-flex flex-wrap items-center justify-center gap-2 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-4 py-2 sm:px-5 sm:py-2.5 text-xs sm:text-sm font-semibold text-emerald-400 shadow-lg shadow-emerald-500/10">
              <Zap className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              <span>7-day free trial</span>
              <span className="text-slate-500">·</span>
              <span>$2.99/mo after</span>
            </div>
            <h1 className="text-3xl font-bold tracking-tight sm:text-4xl md:text-5xl lg:text-6xl xl:text-7xl">
              <span className="bg-gradient-to-r from-emerald-400 via-teal-400 to-sky-400 bg-clip-text text-transparent">
                Schedule posts
              </span>
              {' '}on all major social platforms and get analytics reports.
            </h1>
            <p className="mx-auto mt-6 sm:mt-8 max-w-2xl text-base sm:text-lg leading-relaxed text-slate-400 px-1">
              One dashboard for Instagram, YouTube, TikTok, Facebook, Twitter & LinkedIn. Plan your content and see what works with clear analytics.
            </p>
            <div className="mt-8 sm:mt-12 flex flex-col items-stretch sm:items-center gap-3 sm:gap-4 sm:flex-row">
              <Link
                href="/signup"
                className="group inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 px-6 py-3.5 sm:px-8 sm:py-4 text-base sm:text-lg font-semibold text-white shadow-xl shadow-emerald-500/25 transition-all hover:bg-emerald-400 hover:shadow-emerald-500/40 active:scale-[0.98] sm:hover:-translate-y-0.5 sm:w-auto"
              >
                Start 7-day free trial
                <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" />
              </Link>
              <Link
                href="/pricing"
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-slate-600 bg-slate-800/60 px-6 py-3.5 sm:px-8 sm:py-4 text-base sm:text-lg font-semibold text-white transition-all hover:border-slate-500 hover:bg-slate-800 active:scale-[0.98] sm:w-auto"
              >
                See pricing
              </Link>
            </div>
            <div className="mt-8 sm:mt-12 flex flex-wrap items-center justify-center gap-3 sm:gap-6">
              {[
                { icon: <Instagram className="h-5 w-5" />, label: 'Instagram' },
                { icon: <Youtube className="h-5 w-5" />, label: 'YouTube' },
                { icon: <TikTokIcon className="h-5 w-5" />, label: 'TikTok' },
                { icon: <Facebook className="h-5 w-5" />, label: 'Facebook' },
                { label: 'Twitter' },
                { icon: <Linkedin className="h-5 w-5" />, label: 'LinkedIn' },
              ].map((item) => (
                <span
                  key={item.label}
                  className="flex items-center gap-2 rounded-full border border-slate-600/80 bg-slate-800/50 px-3 py-1.5 sm:px-4 sm:py-2 text-xs sm:text-sm font-medium text-slate-400 transition-all hover:border-emerald-500/40 hover:bg-slate-800 hover:text-slate-300"
                >
                  {item.icon}
                  {item.label}
                </span>
              ))}
            </div>
          </div>
        </section>

        {/* Features */}
        <section id="features" className="border-t border-slate-800/80 bg-slate-900/40 py-16 sm:py-24 md:py-32">
          <div className="mx-auto max-w-5xl px-4 sm:px-6">
            <h2 className="text-center text-2xl font-bold sm:text-3xl md:text-4xl lg:text-5xl">
              Everything you need to grow
            </h2>
            <p className="mx-auto mt-4 sm:mt-5 max-w-2xl text-center text-base sm:text-lg text-slate-400">
              Scheduling and analytics—all in one place.
            </p>
            <div className="mt-12 sm:mt-20 grid gap-6 sm:gap-8 md:grid-cols-2 md:max-w-3xl md:mx-auto">
              <div className="group rounded-2xl border border-slate-700/60 bg-slate-800/40 p-8 backdrop-blur transition-all hover:border-emerald-500/30 hover:bg-slate-800/60 hover:shadow-xl hover:shadow-emerald-500/5">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/20 text-emerald-400 transition-colors group-hover:bg-emerald-500/30">
                  <Calendar className="h-7 w-7" />
                </div>
                <h3 className="mt-6 text-xl font-semibold">Schedule posts</h3>
                <p className="mt-3 leading-relaxed text-slate-400">
                  Plan content for Instagram, YouTube, TikTok, Facebook, Twitter and LinkedIn from one calendar. Set it and forget it.
                </p>
              </div>
              <div className="group rounded-2xl border border-slate-700/60 bg-slate-800/40 p-8 backdrop-blur transition-all hover:border-sky-500/30 hover:bg-slate-800/60 hover:shadow-xl hover:shadow-sky-500/5">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-sky-500/20 text-sky-400 transition-colors group-hover:bg-sky-500/30">
                  <BarChart3 className="h-7 w-7" />
                </div>
                <h3 className="mt-6 text-xl font-semibold">Analytics</h3>
                <p className="mt-3 leading-relaxed text-slate-400">
                  Views, likes, comments, followers, subscribers—see what works and double down.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* How it works */}
        <section id="how-it-works" className="border-t border-slate-800/80 bg-slate-900/40 py-16 sm:py-24 md:py-32">
          <div className="mx-auto max-w-5xl px-4 sm:px-6">
            <h2 className="text-center text-2xl font-bold sm:text-3xl md:text-4xl lg:text-5xl">
              How it works
            </h2>
            <p className="mx-auto mt-4 sm:mt-5 max-w-2xl text-center text-base sm:text-lg text-slate-400">
              Get started in three simple steps.
            </p>
            <div className="mt-10 sm:mt-16 grid gap-8 sm:gap-10 md:grid-cols-3">
              <div className="relative text-center">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border-2 border-emerald-500/50 bg-emerald-500/10 text-emerald-400">
                  <Link2 className="h-7 w-7" />
                </div>
                <span className="absolute -top-2 left-1/2 -translate-x-1/2 rounded-full bg-emerald-500 px-2.5 py-0.5 text-xs font-bold text-white">1</span>
                <h3 className="mt-6 text-lg font-semibold">Connect your accounts</h3>
                <p className="mt-2 text-slate-400">Link Instagram, YouTube, TikTok, Facebook, Twitter or LinkedIn with secure OAuth. One click per platform.</p>
              </div>
              <div className="relative text-center">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border-2 border-emerald-500/50 bg-emerald-500/10 text-emerald-400">
                  <CalendarCheck className="h-7 w-7" />
                </div>
                <span className="absolute -top-2 left-1/2 -translate-x-1/2 rounded-full bg-emerald-500 px-2.5 py-0.5 text-xs font-bold text-white">2</span>
                <h3 className="mt-6 text-lg font-semibold">Create & schedule</h3>
                <p className="mt-2 text-slate-400">Draft your posts, add media, and choose when they go live. One calendar for all your channels.</p>
              </div>
              <div className="relative text-center">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border-2 border-emerald-500/50 bg-emerald-500/10 text-emerald-400">
                  <BarChart2 className="h-7 w-7" />
                </div>
                <span className="absolute -top-2 left-1/2 -translate-x-1/2 rounded-full bg-emerald-500 px-2.5 py-0.5 text-xs font-bold text-white">3</span>
                <h3 className="mt-6 text-lg font-semibold">Track analytics</h3>
                <p className="mt-2 text-slate-400">See views, likes, comments, followers and subscribers in one dashboard. Know what works.</p>
              </div>
            </div>
          </div>
        </section>

        {/* Product detail */}
        <section id="product" className="border-t border-slate-800/80 py-16 sm:py-24 md:py-32">
          <div className="mx-auto max-w-5xl px-4 sm:px-6">
            <h2 className="text-center text-2xl font-bold sm:text-3xl md:text-4xl lg:text-5xl">
              Schedule & analytics—one product
            </h2>
            <p className="mx-auto mt-4 sm:mt-5 max-w-2xl text-center text-base sm:text-lg text-slate-400">
              No juggling multiple tools. One login, all platforms.
            </p>
            <ul className="mx-auto mt-10 sm:mt-14 max-w-2xl space-y-4 sm:space-y-5 text-slate-300">
              {[
                'Schedule posts to Instagram, YouTube, TikTok, Facebook, Twitter and LinkedIn from a single calendar',
                'Analytics: views, likes, comments, followers, subscribers in one dashboard',
                'White-label: upload your logo and colors so it looks like your brand',
              ].map((item, i) => (
                <li key={i} className="flex items-start gap-4 rounded-xl py-2">
                  <Check className="mt-0.5 h-6 w-6 shrink-0 text-emerald-500" />
                  <span className="text-base leading-relaxed">{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Pricing preview */}
        <section className="border-t border-slate-800/80 bg-slate-900/40 py-16 sm:py-24 md:py-32">
          <div className="mx-auto max-w-5xl px-4 sm:px-6">
            <h2 className="text-center text-2xl font-bold sm:text-3xl md:text-4xl lg:text-5xl">
              Simple, transparent pricing
            </h2>
            <p className="mx-auto mt-4 sm:mt-5 max-w-xl text-center text-base sm:text-lg text-slate-400">
              7-day free trial, then $2.99/month. No hidden fees. Cancel anytime.
            </p>
            <div className="mt-10 sm:mt-16 flex flex-col items-stretch sm:items-center justify-center gap-6 sm:gap-8 sm:flex-row">
              <div className="w-full max-w-sm mx-auto rounded-2xl border-2 border-emerald-500/50 bg-slate-800/50 p-6 sm:p-8 text-center shadow-xl shadow-emerald-500/10 transition-all hover:border-emerald-500/70 hover:shadow-emerald-500/20">
                <p className="text-xs sm:text-sm font-semibold uppercase tracking-wider text-emerald-400">7-day free trial</p>
                <p className="mt-2 sm:mt-3 text-3xl sm:text-4xl font-bold">$2.99<span className="text-lg sm:text-xl font-normal text-slate-400">/mo</span></p>
                <p className="mt-1 sm:mt-2 text-xs sm:text-sm text-slate-400">Billed monthly after trial</p>
                <Link
                  href="/signup"
                  className="mt-5 sm:mt-6 inline-block w-full rounded-xl bg-emerald-500 py-3 sm:py-3.5 font-semibold text-white transition-all hover:bg-emerald-400 active:scale-[0.98] sm:hover:-translate-y-0.5"
                >
                  Start 7-day free trial
                </Link>
              </div>
              <div className="w-full max-w-sm mx-auto rounded-2xl border border-slate-700 bg-slate-800/40 p-6 sm:p-8 text-center transition-all hover:border-slate-600 hover:bg-slate-800/60">
                <p className="text-xs sm:text-sm font-semibold uppercase tracking-wider text-slate-400">Yearly</p>
                <p className="mt-2 sm:mt-3 text-3xl sm:text-4xl font-bold">$20<span className="text-lg sm:text-xl font-normal text-slate-400">/yr</span></p>
                <p className="mt-1 sm:mt-2 text-xs sm:text-sm font-medium text-emerald-400">Save ~44%</p>
                <Link
                  href="/signup"
                  className="mt-5 sm:mt-6 inline-block w-full rounded-xl border border-slate-600 py-3 sm:py-3.5 font-semibold text-white transition-all hover:bg-slate-700 active:scale-[0.98]"
                >
                  Start 7-day free trial
                </Link>
              </div>
            </div>
            <p className="mt-10 text-center">
              <Link href="/pricing" className="text-emerald-400 font-medium hover:text-emerald-300 hover:underline">
                View full pricing and features →
              </Link>
            </p>
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" className="border-t border-slate-800/80 bg-slate-900/40 py-16 sm:py-24 md:py-32">
          <div className="mx-auto max-w-3xl px-4 sm:px-6">
            <h2 className="text-center text-2xl font-bold sm:text-3xl md:text-4xl lg:text-5xl">
              Frequently asked questions
            </h2>
            <p className="mx-auto mt-4 sm:mt-5 max-w-xl text-center text-base sm:text-lg text-slate-400">
              Quick answers to common questions.
            </p>
            <dl className="mt-10 sm:mt-14 space-y-4 sm:space-y-6">
              {[
                {
                  q: 'Which platforms can I connect?',
                  a: 'You can connect Instagram, YouTube, TikTok, Facebook, Twitter (X), and LinkedIn. We use each platform’s official OAuth so you authorize access securely.',
                },
                {
                  q: 'How does scheduling work?',
                  a: 'You create a post, add your media and text, pick the date and time, and choose which connected accounts to publish to. We send the post at the scheduled time.',
                },
                {
                  q: 'What analytics do I get?',
                  a: 'We pull views, likes, comments, followers, and subscribers (where available) from your connected accounts into one dashboard so you can see performance across platforms.',
                },
                {
                  q: 'Can I cancel anytime?',
                  a: 'Yes. You can cancel your subscription at any time. You’ll keep access until the end of your billing period.',
                },
                {
                  q: 'Is there a free trial?',
                  a: 'Yes. You get a 7-day free trial to explore scheduling and analytics. No credit card required to start.',
                },
              ].map((item, i) => (
                <div key={i} className="rounded-xl border border-slate-700/60 bg-slate-800/40 p-4 sm:p-6">
                  <dt className="flex items-start gap-3 font-semibold text-white text-left">
                    <HelpCircle className="mt-0.5 h-5 w-5 shrink-0 text-emerald-500" />
                    {item.q}
                  </dt>
                  <dd className="mt-3 pl-8 sm:pl-8 text-slate-400 text-sm sm:text-base leading-relaxed">{item.a}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        {/* CTA */}
        <section className="relative border-t border-slate-800/80 py-16 sm:py-24 md:py-32">
          <div className="absolute inset-0 bg-gradient-to-t from-emerald-500/5 via-transparent to-transparent" />
          <div className="relative mx-auto max-w-3xl px-4 text-center sm:px-6">
            <h2 className="text-2xl font-bold sm:text-3xl md:text-4xl lg:text-5xl">
              Ready to grow your socials?
            </h2>
            <p className="mt-4 sm:mt-5 text-base sm:text-lg text-slate-400">
              Join creators and businesses who schedule smarter with Agent4Socials.
            </p>
            <div className="mt-8 sm:mt-12 flex flex-col items-stretch sm:items-center justify-center gap-4 sm:gap-5 sm:flex-row">
              <Link
                href="/signup"
                className="group inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-500 px-6 py-3.5 sm:px-8 sm:py-4 text-base sm:text-lg font-semibold text-white shadow-xl shadow-emerald-500/25 transition-all hover:bg-emerald-400 hover:shadow-emerald-500/40 active:scale-[0.98] sm:hover:-translate-y-0.5"
              >
                Start 7-day free trial
                <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" />
              </Link>
              <Link href="/login" className="text-slate-400 hover:text-white transition-colors font-medium">
                I already have an account
              </Link>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
