'use client';

import { useEffect, useState } from 'react';
import DashboardPreview from '@/components/landing/DashboardPreview';
import Testimonials from '@/components/landing/Testimonials';
import Link from 'next/link';
import SiteHeader from '@/components/landing/SiteHeader';
import SiteFooter from '@/components/landing/SiteFooter';
import { useAuthModal } from '@/context/AuthModalContext';
import {
  Calendar,
  BarChart3,
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
  Sparkles,
} from 'lucide-react';
import { InstagramIcon, FacebookIcon, TikTokIcon, YoutubeIcon, XTwitterIcon, LinkedinIcon } from '@/components/SocialPlatformIcons';
import { PricingBillingToggle, PricingCard } from '@/components/landing/pricing';

const FREE_HIGHLIGHTS = [
  '1 brand',
  '50 scheduled posts / month',
  'Connect Instagram, Facebook, TikTok, YouTube, LinkedIn',
  'X (Twitter) available on Starter & Pro only',
  '30 days analytics',
  '1 smart link page',
  'Limited AI Assistant use',
];

const STARTER_HIGHLIGHTS = [
  '1 brand included',
  'Unlimited scheduling',
  'Reply to messages and comments',
  'X (Twitter) and LinkedIn connections',
  '6 months analytics',
  'Unlimited AI Assistant use',
  'Export analytics reports (no watermark)',
];

const PRO_HIGHLIGHTS = [
  '1 brand included',
  'Unlimited analytic history',
  'Bulk replies (messages and comments)',
  'Keyword triggers',
  '10 smart link pages',
  'Custom domains',
  'White-label reports',
  'Client dashboard',
  'Priority support',
];

const HERO_PLATFORMS = [
  { Icon: LinkedinIcon, label: 'LinkedIn' },
  { Icon: XTwitterIcon, label: 'Twitter/X' },
  { Icon: TikTokIcon, label: 'TikTok' },
  { Icon: YoutubeIcon, label: 'YouTube' },
  { Icon: FacebookIcon, label: 'Facebook' },
  { Icon: InstagramIcon, label: 'Instagram' },
] as const;

function FaqItem({ question, answer }: { question: string; answer: string }) {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] overflow-hidden transition-all hover:border-white/20">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-start justify-between gap-3 p-5 sm:p-6 text-left"
      >
        <span className="flex items-start gap-3 font-semibold text-white text-sm sm:text-base">
          <HelpCircle className="mt-0.5 h-4 w-4 shrink-0 text-[#a78bfa]" />
          {question}
        </span>
        {isOpen
          ? <ChevronUp className="h-4 w-4 shrink-0 text-slate-500 mt-0.5" />
          : <ChevronDown className="h-4 w-4 shrink-0 text-slate-500 mt-0.5" />}
      </button>
      <div className={`px-5 sm:px-6 text-slate-400 text-sm leading-relaxed overflow-hidden transition-all duration-300 ${isOpen ? 'max-h-96 pb-5 opacity-100' : 'max-h-0 opacity-0'}`}>
        <div className="pl-7">{answer}</div>
      </div>
    </div>
  );
}

export default function Home() {
  const { openLogin, openSignup } = useAuthModal();
  const [billingInterval, setBillingInterval] = useState<'monthly' | 'yearly'>('yearly');

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const { pathname, hash } = window.location;
    if (pathname === '/' && hash && hash.includes('access_token')) {
      window.location.replace('/auth/callback' + hash);
    }
  }, []);

  return (
    <div className="min-h-screen bg-[var(--dark)] text-white overflow-x-hidden">
      <SiteHeader />
      <main>

        {/* HERO */}
        <section className="relative overflow-hidden pt-28 pb-20 sm:pt-36 sm:pb-28">
          {/* Nebula glows */}
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute left-1/2 top-0 -translate-x-1/2 h-[600px] w-[900px] rounded-full bg-[radial-gradient(ellipse_at_center,rgba(109,40,217,0.45)_0%,rgba(76,29,149,0.2)_40%,transparent_70%)]" />
            <div className="absolute -right-40 top-10 h-[400px] w-[500px] rounded-full bg-[radial-gradient(ellipse_at_center,rgba(6,182,212,0.12)_0%,transparent_65%)]" />
            <div className="absolute -left-20 bottom-0 h-[350px] w-[450px] rounded-full bg-[radial-gradient(ellipse_at_center,rgba(139,92,246,0.18)_0%,transparent_65%)]" />
            <div className="absolute bottom-0 left-0 right-0 h-64 bg-gradient-to-t from-[#6d28d9]/30 via-[#7c3aed]/10 to-transparent" />
          </div>

          <div className="relative mx-auto max-w-5xl px-4 sm:px-6 text-center">
            {/* Eyebrow */}
            <div className="inline-flex items-center gap-2 rounded-full border border-[#7c3aed]/50 bg-[#7c3aed]/10 px-4 py-1.5 text-xs font-semibold text-[#a78bfa] uppercase tracking-widest mb-8 backdrop-blur-sm">
              <span className="h-1.5 w-1.5 rounded-full bg-[#a78bfa] animate-pulse" />
              All 6 platforms. One dashboard.
            </div>

            {/* Headline */}
            <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl md:text-6xl lg:text-7xl leading-[1.08]">
              <span className="text-white">Run your entire</span>
              <br />
              <span className="bg-gradient-to-r from-[#a78bfa] via-[#818cf8] to-[#38bdf8] bg-clip-text text-transparent">
                social media
              </span>
              <br />
              <span className="text-white">from one place.</span>
            </h1>

            <p className="mx-auto mt-7 max-w-2xl text-base sm:text-lg text-slate-400 leading-relaxed">
              Schedule content, manage comments and DMs, and grow across Instagram, TikTok, YouTube, Facebook, X and LinkedIn from a single powerful dashboard.
            </p>

            {/* CTAs */}
            <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
              <button
                type="button"
                onClick={openSignup}
                className="group inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#7c3aed] to-[#6d28d9] px-8 py-4 text-base font-bold text-white shadow-[0_0_40px_rgba(109,40,217,0.6)] transition-all hover:shadow-[0_0_60px_rgba(109,40,217,0.8)] hover:scale-[1.03] active:scale-[0.98]"
              >
                Get started free
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </button>
              <Link
                href="/pricing"
                className="inline-flex items-center justify-center rounded-xl border border-white/20 bg-white/5 backdrop-blur-sm px-8 py-4 text-base font-medium text-white transition-all hover:bg-white/10 hover:border-white/30"
              >
                See pricing
              </Link>
            </div>

            {/* Trust bar */}
            <div className="mt-8 flex flex-wrap items-center justify-center gap-6 text-xs text-slate-500">
              <span className="flex items-center gap-1.5"><Check className="h-3.5 w-3.5 text-emerald-500" /> No credit card required</span>
              <span className="flex items-center gap-1.5"><Check className="h-3.5 w-3.5 text-emerald-500" /> Free plan forever</span>
              <span className="flex items-center gap-1.5"><Check className="h-3.5 w-3.5 text-emerald-500" /> Cancel anytime</span>
            </div>
          </div>

          {/* Platforms */}
          <div className="relative mx-auto max-w-3xl px-4 sm:px-6 mt-16 text-center">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-600 mb-5">Connect your platforms</p>
            <div className="flex flex-wrap items-center justify-center gap-3 sm:gap-4">
              {HERO_PLATFORMS.map(({ Icon, label }) => (
                <div key={label} className="group flex flex-col items-center gap-1.5">
                  <div className="rounded-xl border border-white/10 bg-white/5 p-2.5 backdrop-blur-sm transition-all group-hover:border-[#7c3aed]/40 group-hover:bg-[#7c3aed]/10 group-hover:shadow-[0_0_16px_rgba(124,58,237,0.3)]">
                    <span className={label === 'Twitter/X' ? 'inline-block invert opacity-70 group-hover:opacity-100 transition-opacity' : 'opacity-70 group-hover:opacity-100 transition-opacity'}>
                      <Icon size={22} />
                    </span>
                  </div>
                  <span className="text-[10px] text-slate-600 group-hover:text-slate-400 transition-colors">{label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Dashboard preview with floating stat badges */}
          <div className="relative mx-auto max-w-5xl px-4 sm:px-6 mt-14">
            <div className="hidden sm:block absolute -left-2 top-10 z-10">
              <div className="rounded-xl border border-[#7c3aed]/40 bg-[#1a0d3a]/90 backdrop-blur-xl px-4 py-3 shadow-[0_0_30px_rgba(109,40,217,0.35)]">
                <p className="text-[9px] font-semibold uppercase tracking-widest text-[#a78bfa] mb-0.5">Platforms</p>
                <p className="text-lg font-extrabold text-white">6 connected</p>
              </div>
            </div>
            <div className="hidden sm:block absolute -right-2 top-10 z-10">
              <div className="rounded-xl border border-[#0ea5e9]/30 bg-[#0c1a2e]/90 backdrop-blur-xl px-4 py-3 shadow-[0_0_30px_rgba(14,165,233,0.2)]">
                <p className="text-[9px] font-semibold uppercase tracking-widest text-[#38bdf8] mb-0.5">AI Assistant</p>
                <p className="text-lg font-extrabold text-white">Always on</p>
              </div>
            </div>
            <div className="hidden sm:block absolute -left-2 bottom-14 z-10">
              <div className="rounded-xl border border-emerald-500/30 bg-[#0a1f15]/90 backdrop-blur-xl px-4 py-3 shadow-[0_0_30px_rgba(16,185,129,0.2)]">
                <p className="text-[9px] font-semibold uppercase tracking-widest text-emerald-400 mb-0.5">Analytics</p>
                <p className="text-lg font-extrabold text-white">Real-time</p>
              </div>
            </div>
            <div className="hidden sm:block absolute -right-2 bottom-14 z-10">
              <div className="rounded-xl border border-[#7c3aed]/40 bg-[#1a0d3a]/90 backdrop-blur-xl px-4 py-3 shadow-[0_0_30px_rgba(109,40,217,0.35)]">
                <p className="text-[9px] font-semibold uppercase tracking-widest text-[#a78bfa] mb-0.5">Scheduling</p>
                <p className="text-lg font-extrabold text-white">Unlimited</p>
              </div>
            </div>
            <div className="absolute inset-x-16 top-1/2 -translate-y-1/2 h-64 bg-[#6d28d9]/20 blur-3xl pointer-events-none rounded-full" />
            <div className="relative rounded-2xl border border-white/10 overflow-hidden shadow-[0_0_80px_rgba(109,40,217,0.25)]">
              <DashboardPreview />
            </div>
          </div>
        </section>

        {/* FEATURES */}
        <section id="features" className="relative border-t border-white/5 py-24 sm:py-32">
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute right-0 top-1/2 -translate-y-1/2 h-[500px] w-[500px] rounded-full bg-[radial-gradient(ellipse_at_center,rgba(109,40,217,0.1)_0%,transparent_65%)]" />
          </div>
          <div className="relative mx-auto max-w-5xl px-4 sm:px-6">
            <div className="text-center mb-16">
              <h2 className="text-3xl font-extrabold text-white sm:text-4xl">Everything you need to grow</h2>
              <p className="mt-4 text-slate-400 max-w-xl mx-auto">Scheduling, analytics, unified inbox, automation, and AI. All in one place, all six platforms.</p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {[
                { icon: Calendar, label: 'Post Scheduler', desc: 'Plan content for all 6 platforms from one visual calendar. Draft once, publish everywhere.' },
                { icon: BarChart3, label: 'Cross-platform Analytics', desc: 'Views, likes, comments, followers across all your accounts in one unified dashboard.' },
                { icon: MessageCircle, label: 'Unified Inbox', desc: 'DMs and comments from Instagram, Facebook, and X in one feed. Zero app-switching.' },
                { icon: MessageSquare, label: 'Comment Automation', desc: 'Auto-reply on keywords, send welcome DMs, configure per-platform response text.' },
                { icon: Link2, label: 'Smart Links', desc: 'One powerful bio link page. Custom domains on higher plans.' },
                { icon: Sparkles, label: 'AI Assistant', desc: 'Set your brand voice, get AI-suggested captions right inside the Composer.' },
              ].map(({ icon: Icon, label, desc }) => (
                <div key={label} className="group relative flex flex-col gap-4 rounded-2xl border border-white/10 bg-white/[0.04] backdrop-blur-sm p-6 transition-all hover:border-[#7c3aed]/40 hover:bg-[#7c3aed]/5 hover:shadow-[0_0_30px_rgba(109,40,217,0.15)]">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-[#7c3aed]/30 to-[#6d28d9]/10 border border-[#7c3aed]/30 text-[#a78bfa] group-hover:from-[#7c3aed]/40 transition-all">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-white text-base">{label}</h3>
                    <p className="mt-1.5 text-sm text-slate-500 leading-relaxed">{desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* HOW IT WORKS */}
        <section id="how-it-works" className="relative border-t border-white/5 py-24 sm:py-32 overflow-hidden">
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-[600px] w-[700px] rounded-full bg-[radial-gradient(ellipse_at_center,rgba(109,40,217,0.1)_0%,transparent_65%)]" />
          </div>
          <div className="relative mx-auto max-w-5xl px-4 sm:px-6">
            <div className="text-center mb-20">
              <h2 className="text-3xl font-extrabold sm:text-4xl md:text-5xl">Up and running in minutes</h2>
              <p className="mx-auto mt-5 max-w-xl text-slate-400">Three steps from signup to your first scheduled post. No complicated setup.</p>
            </div>
            <div className="grid gap-8 md:grid-cols-3 relative">
              <div className="hidden md:block absolute top-14 left-[calc(16.67%+1rem)] right-[calc(16.67%+1rem)] h-px bg-gradient-to-r from-[#7c3aed]/40 via-[#818cf8]/30 to-[#7c3aed]/40" />
              {[
                { icon: Link2, step: '01', title: 'Connect', desc: 'Authorize your accounts with each platform\'s official OAuth. No passwords stored, just secure logins.' },
                { icon: CalendarCheck, step: '02', title: 'Create & Schedule', desc: 'Use the Composer to write captions, add media, and schedule posts to one or multiple platforms at once.' },
                { icon: BarChart2, step: '03', title: 'Analyze & Grow', desc: 'Track views, likes, followers, and comments. Reply from the unified inbox. See what works and scale.' },
              ].map(({ icon: Icon, step, title, desc }) => (
                <div key={title} className="group relative flex flex-col items-center text-center z-10">
                  <div className="relative mb-6">
                    <div className="flex h-28 w-28 items-center justify-center rounded-2xl border border-[#7c3aed]/30 bg-gradient-to-b from-[#1e0a3c] to-[#16082e] text-[#a78bfa] shadow-[0_0_40px_rgba(109,40,217,0.3)] transition-all group-hover:shadow-[0_0_60px_rgba(109,40,217,0.5)] group-hover:-translate-y-2 duration-300">
                      <Icon className="h-10 w-10" />
                    </div>
                    <div className="absolute -top-3 -right-3 flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-[#7c3aed] to-[#5b21b6] text-[10px] font-black text-white shadow-[0_0_12px_rgba(124,58,237,0.6)]">{step}</div>
                  </div>
                  <h3 className="text-xl font-bold text-white mb-3">{title}</h3>
                  <p className="text-sm text-slate-500 leading-relaxed max-w-xs">{desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* PRODUCT DETAIL */}
        <section id="product" className="relative border-t border-white/5 py-24 sm:py-32 overflow-hidden">
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute -left-20 top-1/2 -translate-y-1/2 h-[400px] w-[400px] rounded-full bg-[radial-gradient(ellipse_at_center,rgba(6,182,212,0.07)_0%,transparent_65%)]" />
          </div>
          <div className="relative mx-auto max-w-5xl px-4 sm:px-6">
            <div className="text-center mb-16">
              <h2 className="text-3xl font-extrabold sm:text-4xl md:text-5xl">One product, everything you need</h2>
              <p className="mx-auto mt-4 max-w-xl text-slate-400">No juggling multiple tools. One login, all platforms. Scale from solo creator to agency.</p>
            </div>
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {[
                { title: 'Publish everywhere', desc: 'Schedule to Instagram, YouTube, TikTok, Facebook, X and LinkedIn from one calendar.', emoji: '🚀' },
                { title: 'Analytics that matter', desc: 'Views, likes, comments, followers and subscribers in one dashboard. See what works.', emoji: '📊' },
                { title: 'Unified inbox', desc: 'View and reply to DMs from Instagram, Facebook and X in one place. No more app hopping.', emoji: '💬' },
                { title: 'Smart automation', desc: 'Keyword comment replies, welcome DMs, and new-follower messages. Set it per post or account.', emoji: '⚡' },
                { title: 'Hashtag pool & AI', desc: 'Save hashtag sets and reuse them. Get AI-suggested captions with your brand voice.', emoji: '✨' },
                { title: 'White-label (Agency)', desc: 'Your logo, your colors. The dashboard looks like your brand. Multiple workspaces on higher plans.', emoji: '🏢' },
              ].map((item) => (
                <div key={item.title} className="group rounded-2xl border border-white/10 bg-white/[0.03] p-6 transition-all hover:border-[#7c3aed]/30 hover:bg-[#7c3aed]/5">
                  <div className="text-2xl mb-3">{item.emoji}</div>
                  <h3 className="font-bold text-white mb-2">{item.title}</h3>
                  <p className="text-sm text-slate-500 leading-relaxed">{item.desc}</p>
                </div>
              ))}
            </div>
            <div className="mt-10 rounded-2xl border border-white/10 bg-white/[0.03] p-6 sm:p-8">
              <ul className="space-y-3">
                {[
                  'All plans include scheduling, basic analytics, unified inbox, and AI assistant.',
                  'Keyword comment automation and higher limits on Starter and Pro.',
                  'Pro adds white-label, custom domains, smart links, and priority support.',
                ].map((item, i) => (
                  <li key={i} className="flex items-start gap-3 text-sm text-slate-400">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* PRICING */}
        <section className="relative border-t border-white/5 py-24 sm:py-32 overflow-hidden">
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute left-1/2 bottom-0 -translate-x-1/2 h-[400px] w-[800px] rounded-full bg-[radial-gradient(ellipse_at_center,rgba(109,40,217,0.12)_0%,transparent_65%)]" />
          </div>
          <div className="relative mx-auto max-w-6xl px-4 sm:px-6">
            <div className="text-center mb-10">
              <h2 className="text-3xl font-extrabold text-white sm:text-4xl">Plans for every stage</h2>
              <p className="mt-3 text-slate-400">Yearly billing saves 20%. No hidden fees.</p>
            </div>
            <div className="pb-8">
              <PricingBillingToggle interval={billingInterval} onIntervalChange={setBillingInterval} dark />
            </div>
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 lg:gap-8">
              <PricingCard plan="free" price="$0" description="Best for trying the platform" highlights={FREE_HIGHLIGHTS} ctaText="Start Free" onCta={openSignup} billingInterval={billingInterval} dark />
              <PricingCard plan="starter" description="Best for creators and freelancers" highlights={STARTER_HIGHLIGHTS} priceMonthly={15} priceYearly={144} yearlyCrossedPrice={180} additionalBrandsMonthly={5} additionalBrandsYearly={48} ctaText="Get Starter" onCta={openSignup} billingInterval={billingInterval} dark />
              <PricingCard plan="pro" description="Best for professionals and agencies" badge="Most Popular" bestValueLabel="Best value for growing brands" highlights={PRO_HIGHLIGHTS} priceMonthly={24} priceYearly={230} yearlyCrossedPrice={288} additionalBrandsMonthly={3} additionalBrandsYearly={29} ctaText="Get Pro" onCta={openSignup} highlighted billingInterval={billingInterval} dark />
            </div>
            <p className="mt-10 text-center">
              <Link href="/pricing" className="text-[#a78bfa] font-medium hover:text-white transition-colors">
                Compare all features and yearly pricing &rarr;
              </Link>
            </p>
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" className="border-t border-white/5 py-24 sm:py-32">
          <div className="mx-auto max-w-3xl px-4 sm:px-6">
            <div className="text-center mb-14">
              <h2 className="text-3xl font-extrabold sm:text-4xl">Frequently asked questions</h2>
              <p className="mx-auto mt-4 max-w-md text-slate-400">Quick answers to common questions.</p>
            </div>
            <div className="space-y-3">
              {[
                { q: 'Which platforms can I connect?', a: 'You can connect Instagram, YouTube, TikTok, Facebook, Twitter (X), and LinkedIn. We use each platform\'s official OAuth so you authorize access securely. Inbox and comment automation are available for Instagram, Facebook and X; scheduling and analytics support all six platforms.' },
                { q: 'How does scheduling work?', a: 'You create a post in the Composer, add your media and text, pick the date and time, and choose which connected accounts to publish to. We send the post at the scheduled time. You can also set keyword comment automation and per-platform reply text per post.' },
                { q: 'What is comment automation?', a: 'When someone comments on your post with a keyword you set (e.g. "demo"), we can automatically reply with a message you define, or send a DM on Instagram if you prefer. You can set different reply text per platform.' },
                { q: 'What analytics do I get?', a: 'We pull views, likes, comments, followers, and subscribers (where available) from your connected accounts into one dashboard so you can see performance across platforms.' },
                { q: 'How do I delete my data?', a: 'You can delete your account and data from Account or Settings in the app, or send a data deletion request to support@agent4socials.com. We process requests within 30 days.' },
                { q: 'Can I cancel anytime?', a: 'Yes. You can cancel your subscription at any time. You\'ll keep access until the end of your billing period.' },
                { q: 'How do I get started?', a: 'Try the Free plan (no credit card required), or sign up for Starter or Pro to unlock more features. Connect your accounts and start scheduling from one dashboard.' },
                { q: 'Which plan is right for me?', a: 'Free is for trying the platform: 1 brand, 50 posts/month, 30 days analytics. Starter ($15/mo) is for creators: unlimited scheduling, inbox, X and LinkedIn, 6 months analytics, unlimited AI. Pro ($24/mo) is for professionals: advanced analytics, bulk replies, keyword triggers, smart links, white-label, and priority support. Yearly billing saves 20%.' },
              ].map((item, i) => (
                <FaqItem key={i} question={item.q} answer={item.a} />
              ))}
            </div>
          </div>
        </section>

        {/* TESTIMONIALS */}
        <Testimonials />

        {/* FINAL CTA */}
        <section className="relative border-t border-white/5 py-24 sm:py-32 overflow-hidden">
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-[500px] w-[700px] rounded-full bg-[radial-gradient(ellipse_at_center,rgba(109,40,217,0.3)_0%,rgba(76,29,149,0.1)_45%,transparent_70%)]" />
          </div>
          <div className="relative mx-auto max-w-2xl px-4 text-center sm:px-6">
            <h2 className="text-3xl font-extrabold sm:text-4xl md:text-5xl">Ready to grow your socials?</h2>
            <p className="mt-5 text-lg text-slate-400">Join creators and businesses who schedule smarter with Agent4Socials.</p>
            <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
              <button
                type="button"
                onClick={openSignup}
                className="group inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#7c3aed] to-[#6d28d9] px-8 py-4 text-base font-bold text-white shadow-[0_0_40px_rgba(109,40,217,0.55)] transition-all hover:shadow-[0_0_60px_rgba(109,40,217,0.75)] hover:scale-[1.03] active:scale-[0.98]"
              >
                Get started free
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </button>
              <button type="button" onClick={openLogin} className="text-slate-500 hover:text-white transition-colors text-sm font-medium">
                I already have an account
              </button>
            </div>
            <p className="mt-6 text-xs text-slate-600">No credit card required. Free plan, forever.</p>
          </div>
        </section>

      </main>
      <SiteFooter />
    </div>
  );
}
