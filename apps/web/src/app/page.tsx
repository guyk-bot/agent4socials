'use client';

import DashboardPreview from '@/components/landing/DashboardPreview';
import Testimonials from '@/components/landing/Testimonials';
import Link from 'next/link';
import Image from 'next/image';
import SiteHeader from '@/components/landing/SiteHeader';
import SiteFooter from '@/components/landing/SiteFooter';
import { useAuthModal } from '@/context/AuthModalContext';
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
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { useState } from 'react';

function FaqItem({ question, answer }: { question: string; answer: string }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="rounded-xl border border-slate-700/60 bg-slate-800/40 overflow-hidden transition-all duration-300 hover:border-slate-600">
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-start justify-between gap-3 p-4 sm:p-6 text-left"
      >
        <span className="flex items-start gap-3 font-semibold text-white">
          <HelpCircle className="mt-0.5 h-5 w-5 shrink-0 text-emerald-500" />
          {question}
        </span>
        {isOpen ? (
          <ChevronUp className="h-5 w-5 shrink-0 text-slate-400" />
        ) : (
          <ChevronDown className="h-5 w-5 shrink-0 text-slate-400" />
        )}
      </button>
      <div 
        className={`px-4 sm:px-6 text-slate-400 text-sm sm:text-base leading-relaxed overflow-hidden transition-all duration-300 ease-in-out ${
          isOpen ? 'max-h-48 pb-6 opacity-100' : 'max-h-0 opacity-0'
        }`}
      >
        <div className="pl-8">{answer}</div>
      </div>
    </div>
  );
}

function TikTokIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z" />
    </svg>
  );
}

export default function Home() {
  const { openLogin, openSignup } = useAuthModal();

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <SiteHeader />
      <main>
        {/* Hero */}
        <section className="relative overflow-hidden pt-24 pb-16 sm:pt-32 sm:pb-24 md:pt-40 md:pb-32">
          {/* Background Effects */}
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(16,185,129,0.15),transparent)] pointer-events-none" />
          <div className="absolute inset-0 bg-gradient-to-b from-emerald-500/5 via-transparent to-transparent pointer-events-none" />
          <div className="absolute top-0 left-1/2 -translate-x-1/2 h-[40rem] w-[40rem] rounded-full bg-emerald-500/10 blur-[100px] animate-pulse-glow pointer-events-none" />
          <div className="absolute bottom-0 right-0 h-96 w-96 rounded-full bg-sky-500/10 blur-[80px] pointer-events-none" />
          <div className="absolute inset-0 bg-[linear-gradient(to_right,#334155_0.5px,transparent_0.5px),linear-gradient(to_bottom,#334155_0.5px,transparent_0.5px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_80%_at_50%_0%,#000_70%,transparent_110%)] pointer-events-none" />
          
          <div className="relative mx-auto max-w-5xl px-4 text-center sm:px-6 animate-fade-in-up">
            <div className="mb-8 inline-flex flex-wrap items-center justify-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/5 px-4 py-1.5 sm:px-5 sm:py-2 text-xs sm:text-sm font-semibold text-emerald-400 shadow-[0_0_20px_-5px_rgba(16,185,129,0.3)] backdrop-blur-sm transition-transform hover:scale-105 cursor-default">
              <Zap className="h-3.5 w-3.5 sm:h-4 sm:w-4 fill-emerald-400/20" />
              <span>7-day free trial</span>
              <span className="text-slate-600">|</span>
              <span className="text-slate-400">$2.99/mo after</span>
            </div>
            
            <h1 className="text-4xl font-bold tracking-tight sm:text-5xl md:text-6xl lg:text-7xl xl:text-[5rem] leading-[1.1]">
              <span className="bg-gradient-to-br from-white via-slate-200 to-slate-400 bg-clip-text text-transparent">
                A simple tool to
              </span>
              <br />
              <span className="bg-gradient-to-r from-emerald-400 via-teal-400 to-sky-400 bg-clip-text text-transparent">
                schedule posts
              </span>
            </h1>
            
            <p className="mx-auto mt-8 max-w-2xl text-lg sm:text-xl leading-relaxed text-slate-400 px-2 font-medium">
              One dashboard for Instagram, YouTube, TikTok, Facebook, Twitter & LinkedIn. 
              <span className="block mt-1 text-slate-500">Plan content, track analytics, and grow your audience.</span>
            </p>
            
            <div className="mt-10 sm:mt-12 flex flex-col items-stretch sm:items-center justify-center gap-4 sm:flex-row">
              <button
                type="button"
                onClick={openSignup}
                className="group relative inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 px-8 py-4 text-lg font-semibold text-white shadow-xl shadow-emerald-500/20 transition-all hover:bg-emerald-400 hover:shadow-emerald-500/40 hover:-translate-y-1 sm:w-auto overflow-hidden"
              >
                <div className="absolute inset-0 -translate-x-full group-hover:animate-[shimmer_1.5s_infinite] bg-gradient-to-r from-transparent via-white/20 to-transparent z-10" />
                <span>Start 7-day free trial</span>
                <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" />
              </button>
              <Link
                href="/pricing"
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-800/40 px-8 py-4 text-lg font-semibold text-slate-300 transition-all hover:text-white hover:border-slate-500 hover:bg-slate-800 sm:w-auto backdrop-blur-sm"
              >
                See pricing
              </Link>
            </div>

            <div className="mt-16 sm:mt-20 flex flex-wrap items-center justify-center gap-3 sm:gap-6 animate-float" style={{ animationDelay: '1s' }}>
              {[
                { icon: <Instagram className="h-5 w-5" />, label: 'Instagram', color: 'hover:border-pink-500/50 hover:text-pink-400' },
                { icon: <Youtube className="h-5 w-5" />, label: 'YouTube', color: 'hover:border-red-500/50 hover:text-red-400' },
                { icon: <TikTokIcon className="h-5 w-5" />, label: 'TikTok', color: 'hover:border-slate-200/50 hover:text-white' },
                { icon: <Facebook className="h-5 w-5" />, label: 'Facebook', color: 'hover:border-blue-500/50 hover:text-blue-400' },
                { label: 'Twitter', color: 'hover:border-sky-500/50 hover:text-sky-400' },
                { icon: <Linkedin className="h-5 w-5" />, label: 'LinkedIn', color: 'hover:border-blue-700/50 hover:text-blue-500' },
              ].map((item) => (
                <span
                  key={item.label}
                  className={`flex items-center gap-2 rounded-full border border-slate-800 bg-slate-900/60 px-4 py-2 text-sm font-medium text-slate-400 transition-all duration-300 hover:-translate-y-1 hover:shadow-lg hover:shadow-current/10 ${item.color} backdrop-blur-md`}
                >
                  {item.icon}
                  {item.label}
                </span>
              ))}
            </div>

            {/* Dashboard Preview */}
            <DashboardPreview />
          </div>
        </section>

        {/* Features */}
        <section id="features" className="border-t border-slate-800/50 bg-slate-950/50 py-24 sm:py-32 relative">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-slate-900/50 via-slate-950 to-slate-950 pointer-events-none" />
          <div className="mx-auto max-w-5xl px-4 sm:px-6 relative z-10">
            <h2 className="text-center text-3xl font-bold sm:text-4xl md:text-5xl">
              Everything you need to grow
            </h2>
            <p className="mx-auto mt-6 max-w-2xl text-center text-lg text-slate-400">
              Powerful tools designed to save you time and boost your engagement.
            </p>
            <div className="mt-16 grid gap-8 md:grid-cols-2 md:max-w-4xl md:mx-auto">
              <div className="group relative rounded-3xl border border-slate-800 bg-slate-900/50 p-8 transition-all hover:border-emerald-500/30 hover:shadow-2xl hover:shadow-emerald-500/5 hover:-translate-y-1">
                <div className="absolute inset-0 rounded-3xl bg-gradient-to-br from-emerald-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                <div className="relative">
                  <div className="mb-6 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-800 text-emerald-400 shadow-inner shadow-white/5 ring-1 ring-white/10 group-hover:scale-110 transition-transform duration-300">
                    <Calendar className="h-7 w-7" />
                  </div>
                  <h3 className="text-2xl font-bold text-slate-100 group-hover:text-emerald-400 transition-colors">Schedule posts</h3>
                  <p className="mt-4 leading-relaxed text-slate-400">
                    Plan content for Instagram, YouTube, TikTok, Facebook, Twitter and LinkedIn from one calendar. Set it and forget it.
                  </p>
                </div>
              </div>
              
              <div className="group relative rounded-3xl border border-slate-800 bg-slate-900/50 p-8 transition-all hover:border-sky-500/30 hover:shadow-2xl hover:shadow-sky-500/5 hover:-translate-y-1">
                <div className="absolute inset-0 rounded-3xl bg-gradient-to-br from-sky-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                <div className="relative">
                  <div className="mb-6 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-800 text-sky-400 shadow-inner shadow-white/5 ring-1 ring-white/10 group-hover:scale-110 transition-transform duration-300">
                    <BarChart3 className="h-7 w-7" />
                  </div>
                  <h3 className="text-2xl font-bold text-slate-100 group-hover:text-sky-400 transition-colors">Analytics</h3>
                  <p className="mt-4 leading-relaxed text-slate-400">
                    Views, likes, comments, followers, subscribers: see what works across all platforms and double down on success.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* How it works */}
        <section id="how-it-works" className="border-t border-slate-800/50 bg-slate-950 py-24 sm:py-32">
          <div className="mx-auto max-w-5xl px-4 sm:px-6">
            <h2 className="text-center text-3xl font-bold sm:text-4xl md:text-5xl">
              How it works
            </h2>
            <p className="mx-auto mt-6 max-w-2xl text-center text-lg text-slate-400">
              Get started in three simple steps.
            </p>
            <div className="mt-16 grid gap-12 md:grid-cols-3 relative">
              {/* Connector line for desktop */}
              <div className="hidden md:block absolute top-1/2 left-0 w-full h-0.5 bg-gradient-to-r from-transparent via-slate-800 to-transparent -translate-y-8 z-0" />
              
              <div className="relative text-center group z-10">
                <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-2xl border border-slate-700 bg-slate-900 text-emerald-400 shadow-xl transition-all duration-300 group-hover:-translate-y-2 group-hover:border-emerald-500/50 group-hover:shadow-emerald-500/20">
                  <Link2 className="h-9 w-9" />
                </div>
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full border border-slate-700 bg-slate-900 px-3 py-1 text-xs font-bold text-slate-300 group-hover:border-emerald-500/50 group-hover:text-emerald-400 transition-colors">Step 1</div>
                <h3 className="mt-8 text-xl font-semibold text-slate-200">Connect</h3>
                <p className="mt-3 text-slate-400 leading-relaxed px-4">Link Instagram, YouTube, TikTok, Facebook, Twitter or LinkedIn securely.</p>
              </div>
              
              <div className="relative text-center group z-10">
                <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-2xl border border-slate-700 bg-slate-900 text-emerald-400 shadow-xl transition-all duration-300 group-hover:-translate-y-2 group-hover:border-emerald-500/50 group-hover:shadow-emerald-500/20">
                  <CalendarCheck className="h-9 w-9" />
                </div>
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full border border-slate-700 bg-slate-900 px-3 py-1 text-xs font-bold text-slate-300 group-hover:border-emerald-500/50 group-hover:text-emerald-400 transition-colors">Step 2</div>
                <h3 className="mt-8 text-xl font-semibold text-slate-200">Schedule</h3>
                <p className="mt-3 text-slate-400 leading-relaxed px-4">Draft posts, add media, and choose when to go live across channels.</p>
              </div>
              
              <div className="relative text-center group z-10">
                <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-2xl border border-slate-700 bg-slate-900 text-emerald-400 shadow-xl transition-all duration-300 group-hover:-translate-y-2 group-hover:border-emerald-500/50 group-hover:shadow-emerald-500/20">
                  <BarChart2 className="h-9 w-9" />
                </div>
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full border border-slate-700 bg-slate-900 px-3 py-1 text-xs font-bold text-slate-300 group-hover:border-emerald-500/50 group-hover:text-emerald-400 transition-colors">Step 3</div>
                <h3 className="mt-8 text-xl font-semibold text-slate-200">Analyze</h3>
                <p className="mt-3 text-slate-400 leading-relaxed px-4">Track views, likes, and growth in one simple dashboard.</p>
              </div>
            </div>
          </div>
        </section>

        {/* Product detail */}
        <section id="product" className="border-t border-slate-800/80 py-16 sm:py-24 md:py-32">
          <div className="mx-auto max-w-5xl px-4 sm:px-6">
            <h2 className="text-center text-2xl font-bold sm:text-3xl md:text-4xl lg:text-5xl">
              Schedule & analytics: one product
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
                <button
                  type="button"
                  onClick={openSignup}
                  className="mt-5 sm:mt-6 w-full rounded-xl bg-emerald-500 py-3 sm:py-3.5 font-semibold text-white transition-all hover:bg-emerald-400 active:scale-[0.98] sm:hover:-translate-y-0.5"
                >
                  Start 7-day free trial
                </button>
              </div>
              <div className="w-full max-w-sm mx-auto rounded-2xl border border-slate-700 bg-slate-800/40 p-6 sm:p-8 text-center transition-all hover:border-slate-600 hover:bg-slate-800/60">
                <p className="text-xs sm:text-sm font-semibold uppercase tracking-wider text-slate-400">Yearly</p>
                <p className="mt-2 sm:mt-3 text-3xl sm:text-4xl font-bold">$19.99<span className="text-lg sm:text-xl font-normal text-slate-400">/yr</span></p>
                <p className="mt-1 sm:mt-2 text-xs sm:text-sm font-medium text-emerald-400">Save ~44%</p>
                <button
                  type="button"
                  onClick={openSignup}
                  className="mt-5 sm:mt-6 w-full rounded-xl border border-slate-600 py-3 sm:py-3.5 font-semibold text-white transition-all hover:bg-slate-700 active:scale-[0.98]"
                >
                  Start 7-day free trial
                </button>
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
            <div className="mt-10 sm:mt-14 space-y-4">
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
                <FaqItem key={i} question={item.q} answer={item.a} />
              ))}
            </div>
          </div>
        </section>

        {/* Testimonials */}
        <Testimonials />

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
              <button
                type="button"
                onClick={openSignup}
                className="group inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-500 px-6 py-3.5 sm:px-8 sm:py-4 text-base sm:text-lg font-semibold text-white shadow-xl shadow-emerald-500/25 transition-all hover:bg-emerald-400 hover:shadow-emerald-500/40 active:scale-[0.98] sm:hover:-translate-y-0.5"
              >
                Start 7-day free trial
                <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" />
              </button>
              <button type="button" onClick={openLogin} className="text-slate-400 hover:text-white transition-colors font-medium">
                I already have an account
              </button>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
