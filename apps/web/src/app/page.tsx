import Link from 'next/link';
import Image from 'next/image';
import SiteHeader from '@/components/landing/SiteHeader';
import SiteFooter from '@/components/landing/SiteFooter';
import {
  Calendar,
  BarChart3,
  Sparkles,
  Instagram,
  Youtube,
  Facebook,
  Linkedin,
  Zap,
  Check,
  ArrowRight,
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
        <section className="relative overflow-hidden pt-28 pb-20 sm:pt-36 sm:pb-28">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(16,185,129,0.15),transparent)]" />
          <div className="absolute inset-0 bg-gradient-to-b from-emerald-500/5 via-transparent to-transparent" />
          <div className="absolute top-1/4 left-1/4 h-[28rem] w-[28rem] rounded-full bg-emerald-500/15 blur-3xl" />
          <div className="absolute bottom-1/4 right-1/4 h-80 w-80 rounded-full bg-sky-500/10 blur-3xl" />
          <div className="absolute inset-0 bg-[linear-gradient(to_right,#334155_0.5px,transparent_0.5px),linear-gradient(to_bottom,#334155_0.5px,transparent_0.5px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_80%_at_50%_0%,#000_70%,transparent_110%)]" />
          <div className="relative mx-auto max-w-5xl px-4 text-center sm:px-6">
            <div className="mb-8 inline-flex items-center gap-2 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-5 py-2 text-sm font-semibold text-emerald-400 shadow-lg shadow-emerald-500/10">
              <Zap className="h-4 w-4" />
              Launch price: $2.99/mo
            </div>
            <h1 className="text-4xl font-bold tracking-tight sm:text-5xl md:text-6xl lg:text-7xl">
              A simple tool to{' '}
              <span className="bg-gradient-to-r from-emerald-400 via-teal-400 to-sky-400 bg-clip-text text-transparent">
                schedule posts
              </span>
              {' '}on all major social platforms and get analytics reports.
            </h1>
            <p className="mx-auto mt-8 max-w-2xl text-lg leading-relaxed text-slate-400">
              One dashboard for Instagram, YouTube, TikTok, Facebook, Twitter & LinkedIn. Plan your content, see what works, and grow with AI-powered insights.
            </p>
            <div className="mt-12 flex flex-col items-center justify-center gap-4 sm:flex-row">
              <Link
                href="/signup"
                className="group inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 px-8 py-4 text-lg font-semibold text-white shadow-xl shadow-emerald-500/25 transition-all hover:bg-emerald-400 hover:shadow-emerald-500/40 hover:-translate-y-0.5 sm:w-auto"
              >
                Start free trial
                <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" />
              </Link>
              <Link
                href="/pricing"
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-slate-600 bg-slate-800/60 px-8 py-4 text-lg font-semibold text-white transition-all hover:border-slate-500 hover:bg-slate-800 sm:w-auto"
              >
                See pricing
              </Link>
            </div>
            <div className="mt-12 flex flex-wrap items-center justify-center gap-4 sm:gap-6">
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
                  className="flex items-center gap-2 rounded-full border border-slate-600/80 bg-slate-800/50 px-4 py-2 text-sm font-medium text-slate-400 transition-all hover:border-emerald-500/40 hover:bg-slate-800 hover:text-slate-300"
                >
                  {item.icon}
                  {item.label}
                </span>
              ))}
            </div>
          </div>
        </section>

        {/* Features */}
        <section id="features" className="border-t border-slate-800/80 bg-slate-900/40 py-24 sm:py-32">
          <div className="mx-auto max-w-5xl px-4 sm:px-6">
            <h2 className="text-center text-3xl font-bold sm:text-4xl md:text-5xl">
              Everything you need to grow
            </h2>
            <p className="mx-auto mt-5 max-w-2xl text-center text-lg text-slate-400">
              Schedule, analyze, and optimize with AI—all in one place.
            </p>
            <div className="mt-20 grid gap-8 md:grid-cols-3">
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
              <div className="group rounded-2xl border border-slate-700/60 bg-slate-800/40 p-8 backdrop-blur transition-all hover:border-violet-500/30 hover:bg-slate-800/60 hover:shadow-xl hover:shadow-violet-500/5">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-500/20 text-violet-400 transition-colors group-hover:bg-violet-500/30">
                  <Sparkles className="h-7 w-7" />
                </div>
                <h3 className="mt-6 text-xl font-semibold">AI mode</h3>
                <p className="mt-3 leading-relaxed text-slate-400">
                  Best time to post, caption ideas, and performance insights—powered by AI.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Product detail */}
        <section id="product" className="border-t border-slate-800/80 py-24 sm:py-32">
          <div className="mx-auto max-w-5xl px-4 sm:px-6">
            <h2 className="text-center text-3xl font-bold sm:text-4xl md:text-5xl">
              Schedule, analytics & AI—one product
            </h2>
            <p className="mx-auto mt-5 max-w-2xl text-center text-lg text-slate-400">
              No juggling multiple tools. One login, all platforms.
            </p>
            <ul className="mx-auto mt-14 max-w-2xl space-y-5 text-slate-300">
              {[
                'Schedule posts to Instagram, YouTube, TikTok, Facebook, Twitter and LinkedIn from a single calendar',
                'Analytics: views, likes, comments, followers, subscribers in one dashboard',
                'AI suggests the best times to upload based on your audience',
                'AI generates post descriptions and captions for your content',
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
        <section className="border-t border-slate-800/80 bg-slate-900/40 py-24 sm:py-32">
          <div className="mx-auto max-w-5xl px-4 sm:px-6">
            <h2 className="text-center text-3xl font-bold sm:text-4xl md:text-5xl">
              Simple, transparent pricing
            </h2>
            <p className="mx-auto mt-5 max-w-xl text-center text-lg text-slate-400">
              Start at $2.99/month. No hidden fees. Cancel anytime.
            </p>
            <div className="mt-16 flex flex-col items-center justify-center gap-8 sm:flex-row">
              <div className="w-full max-w-sm rounded-2xl border-2 border-emerald-500/50 bg-slate-800/50 p-8 text-center shadow-xl shadow-emerald-500/10 transition-all hover:border-emerald-500/70 hover:shadow-emerald-500/20">
                <p className="text-sm font-semibold uppercase tracking-wider text-emerald-400">Monthly</p>
                <p className="mt-3 text-4xl font-bold">$2.99<span className="text-xl font-normal text-slate-400">/mo</span></p>
                <p className="mt-2 text-sm text-slate-400">Billed monthly</p>
                <Link
                  href="/signup"
                  className="mt-6 inline-block w-full rounded-xl bg-emerald-500 py-3.5 font-semibold text-white transition-all hover:bg-emerald-400 hover:-translate-y-0.5"
                >
                  Get started
                </Link>
              </div>
              <div className="w-full max-w-sm rounded-2xl border border-slate-700 bg-slate-800/40 p-8 text-center transition-all hover:border-slate-600 hover:bg-slate-800/60">
                <p className="text-sm font-semibold uppercase tracking-wider text-slate-400">Yearly</p>
                <p className="mt-3 text-4xl font-bold">$20<span className="text-xl font-normal text-slate-400">/yr</span></p>
                <p className="mt-2 text-sm font-medium text-emerald-400">Save ~44%</p>
                <Link
                  href="/signup"
                  className="mt-6 inline-block w-full rounded-xl border border-slate-600 py-3.5 font-semibold text-white transition-all hover:bg-slate-700"
                >
                  Get started
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

        {/* CTA */}
        <section className="relative border-t border-slate-800/80 py-24 sm:py-32">
          <div className="absolute inset-0 bg-gradient-to-t from-emerald-500/5 via-transparent to-transparent" />
          <div className="relative mx-auto max-w-3xl px-4 text-center sm:px-6">
            <h2 className="text-3xl font-bold sm:text-4xl md:text-5xl">
              Ready to grow your socials?
            </h2>
            <p className="mt-5 text-lg text-slate-400">
              Join creators and businesses who schedule smarter with Agent4Socials.
            </p>
            <div className="mt-12 flex flex-col items-center justify-center gap-5 sm:flex-row">
              <Link
                href="/signup"
                className="group inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-8 py-4 text-lg font-semibold text-white shadow-xl shadow-emerald-500/25 transition-all hover:bg-emerald-400 hover:shadow-emerald-500/40 hover:-translate-y-0.5"
              >
                Start free
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
