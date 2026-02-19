'use client';

import { useEffect } from 'react';
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
  Zap,
  Check,
  ArrowRight,
  Link2,
  CalendarCheck,
  BarChart2,
  HelpCircle,
  ChevronDown,
  ChevronUp,
  MessageCircle,
  MessageSquare,
  Hash,
  Sparkles,
} from 'lucide-react';
import { useState } from 'react';
import { InstagramIcon, FacebookIcon, TikTokIcon, YoutubeIcon, XTwitterIcon, LinkedinIcon } from '@/components/SocialPlatformIcons';

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
          isOpen ? 'max-h-[28rem] pb-6 opacity-100' : 'max-h-0 opacity-0'
        }`}
      >
        <div className="pl-8">{answer}</div>
      </div>
    </div>
  );
}

const HERO_PLATFORMS = [
  { Icon: InstagramIcon, label: 'Instagram' },
  { Icon: YoutubeIcon, label: 'YouTube' },
  { Icon: TikTokIcon, label: 'TikTok' },
  { Icon: FacebookIcon, label: 'Facebook' },
  { Icon: XTwitterIcon, label: 'Twitter/X' },
  { Icon: LinkedinIcon, label: 'LinkedIn' },
] as const;

export default function Home() {
  const { openLogin, openSignup } = useAuthModal();

  // When Google OAuth sends user to / with #access_token=..., redirect to callback so session is set and then dashboard
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const { pathname, hash } = window.location;
    if (pathname === '/' && hash && hash.includes('access_token')) {
      window.location.replace('/auth/callback' + hash);
    }
  }, []);

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
              <span className="text-slate-400">Plans from $12/mo</span>
            </div>
            
            <h1 className="text-4xl font-bold tracking-tight sm:text-5xl md:text-6xl lg:text-7xl xl:text-[5rem] leading-[1.1]">
              <span className="bg-gradient-to-br from-white via-slate-200 to-slate-400 bg-clip-text text-transparent">
                Schedule, automate & grow
              </span>
              <br />
              <span className="bg-gradient-to-r from-emerald-400 via-teal-400 to-sky-400 bg-clip-text text-transparent">
                across all your socials
              </span>
            </h1>
            
            <p className="mx-auto mt-8 max-w-2xl text-lg sm:text-xl leading-relaxed text-slate-400 px-2 font-medium">
              One dashboard for Instagram, YouTube, TikTok, Facebook, Twitter and LinkedIn.
              <span className="block mt-1 text-slate-500">Schedule posts, automate comment and DM replies, manage your inbox, and grow with AI-powered captions.</span>
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

            <div className="mt-16 sm:mt-20 flex flex-wrap items-center justify-center gap-6 sm:gap-10">
              {HERO_PLATFORMS.map(({ Icon, label }, i) => (
                <div
                  key={label}
                  className="flex flex-col items-center gap-2 opacity-0 animate-fade-in-up"
                  style={{ animationDelay: `${1.2 + i * 0.12}s`, animationFillMode: 'forwards' }}
                >
                  <div
                    className="rounded-2xl border border-slate-700/60 bg-slate-800/40 p-3 sm:p-4 shadow-lg transition-all duration-300 hover:-translate-y-2 hover:border-emerald-500/40 hover:shadow-emerald-500/20 hover:shadow-xl"
                    style={{ animation: 'hero-logo-float 3s ease-in-out infinite', animationDelay: `${i * 0.2}s` }}
                  >
                    <span className={label === 'Twitter/X' ? 'inline-block invert' : ''}>
                      <Icon size={44} />
                    </span>
                  </div>
                  <span className="text-xs font-medium text-slate-500">{label}</span>
                </div>
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
              Scheduling, analytics, unified inbox, keyword and DM automation, and AI-powered captions. All in one place.
            </p>
            <div className="mt-16 grid gap-8 sm:grid-cols-2 lg:grid-cols-3 md:max-w-5xl md:mx-auto">
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
              <div className="group relative rounded-3xl border border-slate-800 bg-slate-900/50 p-8 transition-all hover:border-violet-500/30 hover:shadow-2xl hover:shadow-violet-500/5 hover:-translate-y-1 sm:col-span-2 lg:col-span-1">
                <div className="absolute inset-0 rounded-3xl bg-gradient-to-br from-violet-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                <div className="relative">
                  <div className="mb-6 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-800 text-violet-400 shadow-inner shadow-white/5 ring-1 ring-white/10 group-hover:scale-110 transition-transform duration-300">
                    <MessageCircle className="h-7 w-7" />
                  </div>
                  <h3 className="text-2xl font-bold text-slate-100 group-hover:text-violet-400 transition-colors">Unified inbox</h3>
                  <p className="mt-4 leading-relaxed text-slate-400">
                    View and reply to DMs and messages from Instagram, Facebook and X in one place.
                  </p>
                </div>
              </div>
              <div className="group relative rounded-3xl border border-slate-800 bg-slate-900/50 p-8 transition-all hover:border-amber-500/30 hover:shadow-2xl hover:shadow-amber-500/5 hover:-translate-y-1">
                <div className="absolute inset-0 rounded-3xl bg-gradient-to-br from-amber-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                <div className="relative">
                  <div className="mb-6 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-800 text-amber-400 shadow-inner shadow-white/5 ring-1 ring-white/10 group-hover:scale-110 transition-transform duration-300">
                    <MessageSquare className="h-7 w-7" />
                  </div>
                  <h3 className="text-2xl font-bold text-slate-100 group-hover:text-amber-400 transition-colors">Comment automation</h3>
                  <p className="mt-4 leading-relaxed text-slate-400">
                    Auto-reply when someone comments a keyword on your post. Set different reply text per platform. Optional welcome DMs when someone messages you first.
                  </p>
                </div>
              </div>
              <div className="group relative rounded-3xl border border-slate-800 bg-slate-900/50 p-8 transition-all hover:border-rose-500/30 hover:shadow-2xl hover:shadow-rose-500/5 hover:-translate-y-1">
                <div className="absolute inset-0 rounded-3xl bg-gradient-to-br from-rose-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                <div className="relative">
                  <div className="mb-6 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-800 text-rose-400 shadow-inner shadow-white/5 ring-1 ring-white/10 group-hover:scale-110 transition-transform duration-300">
                    <Hash className="h-7 w-7" />
                  </div>
                  <h3 className="text-2xl font-bold text-slate-100 group-hover:text-rose-400 transition-colors">Hashtag pool</h3>
                  <p className="mt-4 leading-relaxed text-slate-400">
                    Save and reuse hashtag sets for your posts. Keep your best-performing tags organized and one click away.
                  </p>
                </div>
              </div>
              <div className="group relative rounded-3xl border border-slate-800 bg-slate-900/50 p-8 transition-all hover:border-cyan-500/30 hover:shadow-2xl hover:shadow-cyan-500/5 hover:-translate-y-1">
                <div className="absolute inset-0 rounded-3xl bg-gradient-to-br from-cyan-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                <div className="relative">
                  <div className="mb-6 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-800 text-cyan-400 shadow-inner shadow-white/5 ring-1 ring-white/10 group-hover:scale-110 transition-transform duration-300">
                    <Sparkles className="h-7 w-7" />
                  </div>
                  <h3 className="text-2xl font-bold text-slate-100 group-hover:text-cyan-400 transition-colors">AI Assistant</h3>
                  <p className="mt-4 leading-relaxed text-slate-400">
                    Set your brand voice and audience. Get AI-suggested captions and ideas in the Composer that match your style.
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
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_60%_at_50%_50%,rgba(16,185,129,0.03),transparent)] pointer-events-none" />
          <div className="mx-auto max-w-5xl px-4 sm:px-6 relative z-10">
            <h2 className="text-center text-2xl font-bold sm:text-3xl md:text-4xl lg:text-5xl">
              One product, everything you need
            </h2>
            <p className="mx-auto mt-4 sm:mt-5 max-w-2xl text-center text-base sm:text-lg text-slate-400">
              No juggling multiple tools. One login, all platforms. Scale from solo creator to agency.
            </p>
            <div className="mt-12 sm:mt-16 grid gap-6 sm:grid-cols-2 lg:grid-cols-3 max-w-4xl mx-auto">
              {[
                { title: 'Publish everywhere', desc: 'Schedule to Instagram, YouTube, TikTok, Facebook, Twitter and LinkedIn from one calendar. Draft once, pick time and accounts, and go live.' },
                { title: 'Analytics that matter', desc: 'Views, likes, comments, followers and subscribers in one dashboard. See what works and double down.' },
                { title: 'Unified inbox', desc: 'View and reply to DMs from Instagram, Facebook and X in one place. No more app hopping.' },
                { title: 'Smart automation', desc: 'Keyword comment replies (with different text per platform), welcome DMs, and new-follower messages. Set it per post or account-wide.' },
                { title: 'Hashtag pool & AI', desc: 'Save hashtag sets and reuse them. Set your brand voice and get AI-suggested captions in the Composer.' },
                { title: 'White-label (Agency)', desc: 'Upload your logo and colors so the dashboard looks like your brand. Multiple workspaces and team members on higher plans.' },
              ].map((item, i) => (
                <div key={i} className="rounded-2xl border border-slate-700/60 bg-slate-800/30 p-5 sm:p-6 text-left hover:border-slate-600 hover:bg-slate-800/50 transition-all">
                  <h3 className="font-semibold text-slate-100 text-lg">{item.title}</h3>
                  <p className="mt-2 text-sm text-slate-400 leading-relaxed">{item.desc}</p>
                </div>
              ))}
            </div>
            <ul className="mx-auto mt-14 max-w-2xl space-y-3 text-slate-300 text-sm sm:text-base">
              {[
                'All plans include scheduling, basic analytics, unified inbox, and AI assistant (generations vary by plan).',
                'Keyword comment automation and higher limits on Growth and Agency.',
                'Agency adds multiple brands, team members, white-label, and priority support.',
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
        <section className="border-t border-slate-800/80 bg-slate-900/40 py-16 sm:py-24 md:py-32">
          <div className="mx-auto max-w-5xl px-4 sm:px-6">
            <h2 className="text-center text-2xl font-bold sm:text-3xl md:text-4xl lg:text-5xl">
              Plans for every stage
            </h2>
            <p className="mx-auto mt-4 sm:mt-5 max-w-xl text-center text-base sm:text-lg text-slate-400">
              7-day free trial on any plan. Yearly billing saves 19%. No hidden fees.
            </p>
            <div className="mt-12 grid gap-6 sm:grid-cols-3 max-w-4xl mx-auto">
              <div className="rounded-2xl border border-slate-700 bg-slate-800/40 p-5 sm:p-6 text-center">
                <p className="text-xs font-semibold uppercase tracking-wider text-emerald-400">Creator</p>
                <p className="mt-2 text-2xl font-bold">$12<span className="text-slate-400 font-normal text-base">/mo</span></p>
                <p className="mt-1 text-xs text-slate-500">5 accounts, scheduling, inbox, 100 DM automations, AI (30/mo)</p>
                <Link href="/pricing" className="mt-4 inline-block w-full rounded-xl border border-slate-600 py-2.5 text-sm font-semibold text-slate-200 transition hover:bg-slate-700">View plan</Link>
              </div>
              <div className="rounded-2xl border-2 border-sky-500/50 bg-slate-800/60 p-5 sm:p-6 text-center relative">
                <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 rounded-full bg-sky-500 px-2 py-0.5 text-[10px] font-semibold text-white">Popular</span>
                <p className="text-xs font-semibold uppercase tracking-wider text-sky-400">Growth</p>
                <p className="mt-2 text-2xl font-bold">$24<span className="text-slate-400 font-normal text-base">/mo</span></p>
                <p className="mt-1 text-xs text-slate-500">15 accounts, advanced analytics, keyword automations, 1K DM actions, AI (150/mo)</p>
                <Link href="/pricing" className="mt-4 inline-block w-full rounded-xl bg-sky-500 py-2.5 text-sm font-semibold text-white transition hover:bg-sky-400">View plan</Link>
              </div>
              <div className="rounded-2xl border border-slate-700 bg-slate-800/40 p-5 sm:p-6 text-center">
                <p className="text-xs font-semibold uppercase tracking-wider text-violet-400">Agency</p>
                <p className="mt-2 text-2xl font-bold">$59<span className="text-slate-400 font-normal text-base">/mo</span></p>
                <p className="mt-1 text-xs text-slate-500">Multiple brands, 3 team members, white-label, AI (500+/mo), priority support</p>
                <Link href="/pricing" className="mt-4 inline-block w-full rounded-xl border border-violet-500/50 py-2.5 text-sm font-semibold text-violet-300 transition hover:bg-violet-500/10">View plan</Link>
              </div>
            </div>
            <p className="mt-10 text-center">
              <Link href="/pricing" className="text-emerald-400 font-medium hover:text-emerald-300 hover:underline">
                Compare all features and yearly pricing →
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
                  a: 'You can connect Instagram, YouTube, TikTok, Facebook, Twitter (X), and LinkedIn. We use each platform’s official OAuth so you authorize access securely. Inbox and comment automation are available for Instagram, Facebook and X; scheduling and analytics support all six platforms.',
                },
                {
                  q: 'How does scheduling work?',
                  a: 'You create a post in the Composer, add your media and text, pick the date and time, and choose which connected accounts to publish to. We send the post at the scheduled time. You can also set keyword comment automation and per-platform reply text per post.',
                },
                {
                  q: 'What is comment automation?',
                  a: 'When someone comments on your post with a keyword you set (e.g. "demo"), we can automatically reply with a message you define, or send a DM on Instagram if you prefer. You can set different reply text per platform (Instagram, Facebook, X).',
                },
                {
                  q: 'What analytics do I get?',
                  a: 'We pull views, likes, comments, followers, and subscribers (where available) from your connected accounts into one dashboard so you can see performance across platforms.',
                },
                {
                  q: 'How do I delete my data?',
                  a: 'You can delete your account and data from Account or Settings in the app, or send a data deletion request to support@agent4socials.com. We process requests within 30 days. See our Privacy Policy and Data Deletion page for details.',
                },
                {
                  q: 'Can I cancel anytime?',
                  a: 'Yes. You can cancel your subscription at any time. You’ll keep access until the end of your billing period.',
                },
                {
                  q: 'Is there a free trial?',
                  a: 'Yes. You get a 7-day free trial on any plan (Creator, Growth, or Agency) to explore scheduling, automation, inbox and analytics. No credit card required to start.',
                },
                {
                  q: 'Which plan is right for me?',
                  a: 'Creator ($12/mo) is for solo creators and small businesses: 5 accounts, scheduling, basic analytics, inbox, 100 DM automations, and 30 AI generations per month. Growth ($24/mo) adds 15 accounts, advanced analytics, keyword automations, 1,000 DM actions, and 150 AI generations. Agency ($59/mo) is for teams: multiple brands, 3 team members, white-label, higher limits, and priority support. Yearly billing saves 19%.',
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
