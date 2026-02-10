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
  Twitter,
  Linkedin,
  Zap,
  Check,
  ArrowRight,
} from 'lucide-react';

export default function Home() {
  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <SiteHeader />
      <main>
        {/* Hero */}
        <section className="relative overflow-hidden pt-28 pb-20 sm:pt-36 sm:pb-28">
          <div className="absolute inset-0 bg-gradient-to-b from-emerald-500/10 via-transparent to-transparent" />
          <div className="absolute top-1/4 left-1/4 h-96 w-96 rounded-full bg-emerald-500/20 blur-3xl" />
          <div className="absolute bottom-1/4 right-1/4 h-80 w-80 rounded-full bg-sky-500/10 blur-3xl" />
          <div className="relative mx-auto max-w-5xl px-4 text-center sm:px-6">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-4 py-1.5 text-sm font-medium text-emerald-400">
              <Zap className="h-4 w-4" />
              Launch price: $2.99/mo
            </div>
            <h1 className="text-4xl font-bold tracking-tight sm:text-5xl md:text-6xl">
              One dashboard for{' '}
              <span className="bg-gradient-to-r from-emerald-400 to-sky-400 bg-clip-text text-transparent">
                Instagram, YouTube, TikTok, Facebook, X & LinkedIn
              </span>
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-lg text-slate-400">
              Schedule posts, track performance, and let AI find the best times to post and write captions.
              White-label ready so it looks like your own brand.
            </p>
            <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
              <Link
                href="/signup"
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 px-8 py-4 text-lg font-semibold text-white shadow-lg shadow-emerald-500/30 transition hover:bg-emerald-400 sm:w-auto"
              >
                Start free trial
                <ArrowRight className="h-5 w-5" />
              </Link>
              <Link
                href="/pricing"
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-slate-600 bg-slate-800/50 px-8 py-4 text-lg font-semibold text-white transition hover:border-slate-500 hover:bg-slate-800 sm:w-auto"
              >
                See pricing
              </Link>
            </div>
            <div className="mt-12 flex flex-wrap items-center justify-center gap-6 sm:gap-8 text-slate-500">
              <span className="flex items-center gap-2">
                <Instagram className="h-5 w-5" />
                Instagram
              </span>
              <span className="flex items-center gap-2">
                <Youtube className="h-5 w-5" />
                YouTube
              </span>
              <span className="flex items-center gap-2 text-lg font-medium">TikTok</span>
              <span className="flex items-center gap-2">
                <Facebook className="h-5 w-5" />
                Facebook
              </span>
              <span className="flex items-center gap-2">
                <Twitter className="h-5 w-5" />
                X
              </span>
              <span className="flex items-center gap-2">
                <Linkedin className="h-5 w-5" />
                LinkedIn
              </span>
            </div>
          </div>
        </section>

        {/* Features */}
        <section id="features" className="border-t border-slate-800 bg-slate-900/50 py-20 sm:py-28">
          <div className="mx-auto max-w-5xl px-4 sm:px-6">
            <h2 className="text-center text-3xl font-bold sm:text-4xl">
              Everything you need to grow
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-center text-slate-400">
              Schedule, analyze, and optimize with AI—all in one place.
            </p>
            <div className="mt-16 grid gap-10 md:grid-cols-3">
              <div className="rounded-2xl border border-slate-700/50 bg-slate-800/30 p-8 backdrop-blur">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-400">
                  <Calendar className="h-6 w-6" />
                </div>
                <h3 className="mt-6 text-xl font-semibold">Schedule posts</h3>
                <p className="mt-3 text-slate-400">
                  Plan content for Instagram, YouTube, TikTok, Facebook, X and LinkedIn from one calendar. Set it and forget it.
                </p>
              </div>
              <div className="rounded-2xl border border-slate-700/50 bg-slate-800/30 p-8 backdrop-blur">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-sky-500/20 text-sky-400">
                  <BarChart3 className="h-6 w-6" />
                </div>
                <h3 className="mt-6 text-xl font-semibold">Analytics</h3>
                <p className="mt-3 text-slate-400">
                  Views, likes, comments, followers, subscribers—see what works and double down.
                </p>
              </div>
              <div className="rounded-2xl border border-slate-700/50 bg-slate-800/30 p-8 backdrop-blur">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-violet-500/20 text-violet-400">
                  <Sparkles className="h-6 w-6" />
                </div>
                <h3 className="mt-6 text-xl font-semibold">AI mode</h3>
                <p className="mt-3 text-slate-400">
                  Best time to post, caption ideas, and performance insights—powered by AI.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Product detail */}
        <section id="product" className="border-t border-slate-800 py-20 sm:py-28">
          <div className="mx-auto max-w-5xl px-4 sm:px-6">
            <h2 className="text-center text-3xl font-bold sm:text-4xl">
              Schedule, analytics & AI—one product
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-center text-slate-400">
              No juggling multiple tools. One login, all platforms.
            </p>
            <ul className="mx-auto mt-12 max-w-2xl space-y-4 text-slate-300">
              {[
                'Schedule posts to Instagram, YouTube, TikTok, Facebook, X and LinkedIn from a single calendar',
                'Analytics: views, likes, comments, followers, subscribers in one dashboard',
                'AI suggests the best times to upload based on your audience',
                'AI generates post descriptions and captions for your content',
                'White-label: upload your logo and colors so it looks like your brand',
              ].map((item, i) => (
                <li key={i} className="flex items-start gap-3">
                  <Check className="mt-0.5 h-5 w-5 shrink-0 text-emerald-500" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Pricing preview */}
        <section className="border-t border-slate-800 bg-slate-900/50 py-20 sm:py-28">
          <div className="mx-auto max-w-5xl px-4 sm:px-6">
            <h2 className="text-center text-3xl font-bold sm:text-4xl">
              Simple, transparent pricing
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-center text-slate-400">
              Start at $2.99/month. No hidden fees. Cancel anytime.
            </p>
            <div className="mt-12 flex flex-col items-center justify-center gap-6 sm:flex-row">
              <div className="w-full max-w-sm rounded-2xl border-2 border-emerald-500/50 bg-slate-800/50 p-8 text-center">
                <p className="text-sm font-medium text-emerald-400">Monthly</p>
                <p className="mt-2 text-4xl font-bold">$2.99<span className="text-lg font-normal text-slate-400">/mo</span></p>
                <p className="mt-2 text-sm text-slate-400">Billed monthly</p>
                <Link
                  href="/signup"
                  className="mt-6 inline-block w-full rounded-xl bg-emerald-500 py-3 font-semibold text-white transition hover:bg-emerald-400"
                >
                  Get started
                </Link>
              </div>
              <div className="w-full max-w-sm rounded-2xl border border-slate-700 bg-slate-800/30 p-8 text-center">
                <p className="text-sm font-medium text-slate-400">Yearly</p>
                <p className="mt-2 text-4xl font-bold">$20<span className="text-lg font-normal text-slate-400">/yr</span></p>
                <p className="mt-2 text-sm text-emerald-400">Save ~44%</p>
                <Link
                  href="/signup"
                  className="mt-6 inline-block w-full rounded-xl border border-slate-600 py-3 font-semibold text-white transition hover:bg-slate-700"
                >
                  Get started
                </Link>
              </div>
            </div>
            <p className="mt-8 text-center">
              <Link href="/pricing" className="text-emerald-400 hover:underline">
                View full pricing and features →
              </Link>
            </p>
          </div>
        </section>

        {/* CTA */}
        <section className="border-t border-slate-800 py-20 sm:py-28">
          <div className="mx-auto max-w-3xl px-4 text-center sm:px-6">
            <h2 className="text-3xl font-bold sm:text-4xl">
              Ready to grow your socials?
            </h2>
            <p className="mt-4 text-slate-400">
              Join creators and businesses who schedule smarter with Agent4Socials.
            </p>
            <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
              <Link
                href="/signup"
                className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-8 py-4 text-lg font-semibold text-white shadow-lg shadow-emerald-500/25 transition hover:bg-emerald-400"
              >
                Start free
                <ArrowRight className="h-5 w-5" />
              </Link>
              <Link href="/login" className="text-slate-400 hover:text-white transition-colors">
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
