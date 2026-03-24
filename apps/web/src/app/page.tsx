'use client';

import { useEffect, useState, useRef } from 'react';
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
import { InstagramIcon, FacebookIcon, TikTokIcon, YoutubeIcon, XTwitterIcon, LinkedinIcon, PinterestIcon } from '@/components/SocialPlatformIcons';
import { PricingBillingToggle, PricingCard } from '@/components/landing/pricing';
const FREE_HIGHLIGHTS = [
  '1 brand',
  '50 scheduled posts / month',
  'Connect Instagram, Facebook, TikTok, YouTube, LinkedIn, and Pinterest',
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
  { Icon: FacebookIcon, label: 'Facebook' },
  { Icon: InstagramIcon, label: 'Instagram' },
  { Icon: YoutubeIcon, label: 'YouTube' },
  { Icon: TikTokIcon, label: 'TikTok' },
  { Icon: XTwitterIcon, label: 'Twitter/X' },
  { Icon: LinkedinIcon, label: 'LinkedIn' },
  { Icon: PinterestIcon, label: 'Pinterest' },
] as const;

// Brand colors for each social platform icon
const PLATFORM_COLORS: Record<string, string> = {
  Facebook: '#1877f2',
  Instagram: '#e1306c',
  YouTube: '#ff0000',
  TikTok: '#010101',
  'Twitter/X': '#000000',
  LinkedIn: '#0a66c2',
  Pinterest: '#e60023',
};

const RANDOM_ICON_SLOTS = [
  // Keep logos in side lanes only, avoid headline + CTA center column.
  { x: 6, y: 64 },
  { x: 10, y: 78 },
  { x: 14, y: 90 },
  { x: 20, y: 72 },
  { x: 80, y: 72 },
  { x: 86, y: 90 },
  { x: 90, y: 78 },
  { x: 94, y: 64 },
  { x: 24, y: 86 },
  { x: 76, y: 86 },
] as const;

function PlatformsOrbit({ platforms }: { platforms: typeof HERO_PLATFORMS }) {
  const ref = useRef<HTMLDivElement>(null);
  const [positions, setPositions] = useState<Array<{ x: number; y: number }>>([]);
  const [inView, setInView] = useState(true);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const shuffled = [...RANDOM_ICON_SLOTS].sort(() => Math.random() - 0.5);
    setPositions(shuffled.slice(0, platforms.length));
  }, [platforms.length]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onScroll = () => {
      const rect = el.getBoundingClientRect();
      const viewH = window.innerHeight;
      setInView(rect.bottom > viewH * 0.08 && rect.top < viewH * 0.92);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const media = window.matchMedia('(max-width: 639px)');
    const update = () => setIsMobile(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  return (
    <div
      ref={ref}
      className="pointer-events-none absolute inset-x-0 top-56 z-[3] mx-auto h-[240px] max-w-6xl overflow-hidden px-2 sm:top-58 sm:h-[250px] sm:px-0"
      aria-hidden="true"
    >
      {platforms.map(({ Icon, label }, i) => {
        const slot = positions[i] ?? RANDOM_ICON_SLOTS[i % RANDOM_ICON_SLOTS.length];
        const color = PLATFORM_COLORS[label] ?? '#7b2cbf';
        const iconSize = isMobile ? 36 : 48;
        return (
          <div
            key={label}
            className="absolute"
            style={{
              left: `${slot.x}%`,
              top: `${slot.y}%`,
              transform: 'translate(-50%, -50%)',
              opacity: inView ? 1 : 0,
              transition: `opacity 0.35s ease ${i * 0.03}s`,
              zIndex: 8 + i,
            }}
          >
            <div
              className="absolute inset-0 rounded-full pointer-events-none"
              style={{
                background: `radial-gradient(circle, ${color}55 0%, transparent 70%)`,
                transform: 'scale(2)',
                opacity: 0.66,
                filter: 'blur(8px)',
              }}
            />
            <div
              className="relative"
              style={{
                animation: `platformAmbient${i} ${4.8 + (i % 2) * 0.45}s ease-in-out infinite`,
                animationDelay: `${(i * 0.37).toFixed(2)}s`,
                filter: `drop-shadow(0 0 12px ${color}aa)`,
              }}
            >
              <Icon size={iconSize} softenOnLight />
            </div>
          </div>
        );
      })}
      <style>{`
        ${platforms.map((_, i) => `
          @keyframes platformAmbient${i} {
            0%, 100% { transform: translate3d(0px, 0px, 0px) rotate(0deg) scale(1); }
            25% { transform: translate3d(${(i % 2 === 0 ? 1 : -1) * (4 + i)}px, ${-3 - (i % 3)}px, 0px) rotate(${i % 2 === 0 ? 2.2 : -2.2}deg) scale(1.03); }
            50% { transform: translate3d(${(i % 2 === 0 ? -1 : 1) * (3 + i)}px, ${3 + (i % 2)}px, 0px) rotate(${i % 2 === 0 ? -1.2 : 1.2}deg) scale(0.99); }
            75% { transform: translate3d(${(i % 2 === 0 ? 1 : -1) * (5 + i)}px, ${-2 - (i % 2)}px, 0px) rotate(${i % 2 === 0 ? 1.8 : -1.8}deg) scale(1.02); }
          }
        `).join('')}
      `}</style>
    </div>
  );
}

function FaqItem({ question, answer }: { question: string; answer: string }) {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <div className="rounded-[20px] border border-[#efe7f7] bg-white overflow-hidden transition-all duration-300 hover:border-[#d9c8ec] hover:shadow-md">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-start justify-between gap-3 p-5 sm:p-6 text-left"
      >
        <span className="flex items-start gap-3 font-semibold text-[#1a161f] text-sm sm:text-base">
          <HelpCircle className="mt-0.5 h-4 w-4 shrink-0 text-[#7b2cbf]" />
          {question}
        </span>
        {isOpen
          ? <ChevronUp className="h-4 w-4 shrink-0 text-[#8f7ca9] mt-0.5" />
          : <ChevronDown className="h-4 w-4 shrink-0 text-[#8f7ca9] mt-0.5" />}
      </button>
      <div className={`px-5 sm:px-6 text-[#5d5768] text-sm leading-relaxed overflow-hidden transition-all duration-300 ${isOpen ? 'max-h-96 pb-5 opacity-100' : 'max-h-0 opacity-0'}`}>
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
    <div className="min-h-screen bg-white text-[#1a161f] overflow-x-hidden">
      <SiteHeader />
      <main>

        {/* HERO */}
        <section className="relative overflow-hidden pt-28 pb-20 sm:pt-36 sm:pb-28">
          {/* Design system: radial glow + light streaks feel */}
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute left-1/2 top-0 -translate-x-1/2 h-[600px] w-[900px] rounded-full bg-[radial-gradient(ellipse_at_center,rgba(123,44,191,0.14)_0%,rgba(215,38,61,0.06)_42%,transparent_72%)]" />
            <div className="absolute -right-32 top-20 h-[450px] w-[550px] rounded-full bg-[radial-gradient(ellipse_at_center,rgba(215,38,61,0.08)_0%,transparent_65%)]" />
            <div className="absolute -left-24 bottom-10 h-[380px] w-[480px] rounded-full bg-[radial-gradient(ellipse_at_center,rgba(63,55,201,0.07)_0%,transparent_65%)]" />
            <div className="absolute bottom-0 left-0 right-0 h-72 bg-gradient-to-t from-[#f6ebfb] via-[#fff4f8] to-transparent" />
          </div>

          <div className="relative mx-auto max-w-5xl px-4 sm:px-6 text-center">
            <h1 className="mt-1 text-[44px] font-bold tracking-[-0.028em] leading-[1.04] sm:text-5xl md:text-[64px] lg:text-[76px]">
              <span className="block text-[#7b2cbf]">2-7X Your Content Potential</span>
              <span className="mt-1.5 block text-[#1a161f]">Without Paying For Ads</span>
            </h1>

            <p className="mx-auto mt-6 max-w-[760px] text-[15px] sm:text-lg text-[#5d5768] leading-relaxed">
              Schedule content, manage comments and DMs, and grow across Instagram, TikTok, YouTube, Facebook, Twitter/X,
              LinkedIn, and Pinterest from a single powerful dashboard.
            </p>

            <div className="mt-9 flex flex-col sm:flex-row items-center justify-center gap-3.5 sm:gap-4">
              <button
                type="button"
                onClick={openSignup}
                className="group inline-flex min-w-[196px] items-center justify-center gap-2 rounded-full bg-[linear-gradient(135deg,#7b2cbf_0%,#d7263d_100%)] px-8 py-3.5 text-base font-semibold text-white shadow-[0_10px_30px_rgba(123,44,191,0.24)] transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_14px_35px_rgba(215,38,61,0.28)] active:translate-y-0"
              >
                Get started free
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </button>
              <Link
                href="/pricing"
                className="inline-flex min-w-[196px] items-center justify-center rounded-full border border-[#dcc9ef] bg-white px-8 py-3.5 text-base font-semibold text-[#6f2dbd] shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md active:translate-y-0"
              >
                See pricing
              </Link>
            </div>

            <div className="mx-auto mt-8 inline-flex flex-wrap items-center justify-center gap-x-5 gap-y-2 rounded-full border border-[#eadff5] bg-white px-4 py-2 text-xs text-[#5d5768] sm:px-5">
              <span className="flex items-center gap-1.5"><Check className="h-3.5 w-3.5 text-[#2f9e44]" /> No credit card required</span>
              <span className="flex items-center gap-1.5"><Check className="h-3.5 w-3.5 text-[#2f9e44]" /> Free plan forever</span>
              <span className="flex items-center gap-1.5"><Check className="h-3.5 w-3.5 text-[#2f9e44]" /> Cancel anytime</span>
            </div>
          </div>

          {/* Platforms: animated orbit burst */}
          <PlatformsOrbit platforms={HERO_PLATFORMS} />

          {/* Dashboard preview + floating glass badges (design: detached UI, blur, glow) */}
          <div className="relative mx-auto max-w-5xl px-4 sm:px-6 mt-14">
            <div className="hidden sm:block absolute -left-2 top-10 z-10">
              <div className="rounded-[16px] border border-[#eadff5] bg-white px-4 py-3 shadow-sm">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-[#7b2cbf] mb-0.5">Platforms</p>
                <p className="text-lg font-bold text-[#1a161f]">7 connected</p>
              </div>
            </div>
            <div className="hidden sm:block absolute -right-2 top-10 z-10">
              <div className="rounded-[16px] border border-[#eadff5] bg-white px-4 py-3 shadow-sm">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-[#d7263d] mb-0.5">AI Assistant</p>
                <p className="text-lg font-bold text-[#1a161f]">Always on</p>
              </div>
            </div>
            <div className="hidden sm:block absolute -left-2 bottom-14 z-10">
              <div className="rounded-[16px] border border-[#eadff5] bg-white px-4 py-3 shadow-sm">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-[#3f37c9] mb-0.5">Analytics</p>
                <p className="text-lg font-bold text-[#1a161f]">Real-time</p>
              </div>
            </div>
            <div className="hidden sm:block absolute -right-2 bottom-14 z-10">
              <div className="rounded-[16px] border border-[#eadff5] bg-white px-4 py-3 shadow-sm">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-[#7b2cbf] mb-0.5">Scheduling</p>
                <p className="text-lg font-bold text-[#1a161f]">Unlimited</p>
              </div>
            </div>
            <div className="absolute inset-x-16 top-1/2 -translate-y-1/2 h-64 bg-[radial-gradient(circle,rgba(123,44,191,0.18),transparent)] blur-3xl pointer-events-none rounded-full" />
            <div className="relative rounded-[24px] border border-[#eadff5] overflow-hidden shadow-[0_14px_30px_rgba(123,44,191,0.12)] bg-white">
              <DashboardPreview />
            </div>
          </div>
        </section>

        {/* FEATURES - glassmorphism cards, neon accents */}
        <section id="features" className="relative border-t border-[#efe7f7] py-20 sm:py-28">
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute right-0 top-1/2 -translate-y-1/2 h-[500px] w-[500px] rounded-full bg-[radial-gradient(ellipse_at_center,rgba(139,92,246,0.25)_0%,transparent_65%)]" />
          </div>
          <div className="relative mx-auto max-w-5xl px-4 sm:px-6">
            <div className="text-center mb-14">
              <h2 className="text-[28px] sm:text-[36px] font-bold tracking-[-0.02em] text-[#1a161f]">Everything you need to grow</h2>
              <p className="mt-4 text-[#5d5768] max-w-xl mx-auto text-base">Scheduling, analytics, unified inbox, automation, and AI. All in one place, all seven platforms.</p>
            </div>
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {[
                { icon: Calendar, label: 'Post Scheduler', desc: 'Plan content for all 7 platforms from one visual calendar. Draft once, publish everywhere.' },
                { icon: BarChart3, label: 'Cross-platform Analytics', desc: 'Views, likes, comments, followers across all your accounts in one unified dashboard.' },
                { icon: MessageCircle, label: 'Unified Inbox', desc: 'DMs and comments from Instagram, Facebook, and X in one feed. Zero app-switching.' },
                { icon: MessageSquare, label: 'Comment Automation', desc: 'Auto-reply on keywords, send welcome DMs, configure per-platform response text.' },
                { icon: Link2, label: 'Smart Links', desc: 'One powerful bio link page. Custom domains on higher plans.' },
                { icon: Sparkles, label: 'AI Assistant', desc: 'Set your brand voice, get AI-suggested captions right inside the Composer.' },
              ].map(({ icon: Icon, label, desc }) => (
                <div key={label} className="group relative flex flex-col gap-4 rounded-[20px] border border-[#efe7f7] bg-white p-6 transition-all duration-300 hover:border-[#d9c8ec] hover:shadow-md hover:scale-[1.01]">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#fbf7ff] border border-[#efe7f7] text-[#7b2cbf] transition-all">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-[#1a161f] text-base">{label}</h3>
                    <p className="mt-1.5 text-sm text-[#5d5768] leading-relaxed">{desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* HOW IT WORKS - step cards with glow */}
        <section id="how-it-works" className="relative border-t border-[#efe7f7] py-20 sm:py-28 overflow-hidden">
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-[600px] w-[700px] rounded-full bg-[radial-gradient(circle,rgba(139,92,246,0.25),transparent_65%)]" />
          </div>
          <div className="relative mx-auto max-w-5xl px-4 sm:px-6">
            <div className="text-center mb-16">
              <h2 className="text-[28px] sm:text-4xl md:text-5xl font-bold tracking-[-0.02em] text-[#1a161f]">Up and running in minutes</h2>
              <p className="mx-auto mt-5 max-w-xl text-[#5d5768]">Three steps from signup to your first scheduled post. No complicated setup.</p>
            </div>
            <div className="grid gap-10 md:grid-cols-3 relative">
              <div className="hidden md:block absolute top-14 left-[calc(16.67%+1rem)] right-[calc(16.67%+1rem)] h-px bg-gradient-to-r from-[#7b2cbf]/25 via-[#d7263d]/25 to-[#ff3d00]/20" />
              {[
                { icon: Link2, step: '01', title: 'Connect', desc: 'Authorize your accounts with each platform\'s official OAuth. No passwords stored, just secure logins.' },
                { icon: CalendarCheck, step: '02', title: 'Create & Schedule', desc: 'Use the Composer to write captions, add media, and schedule posts to one or multiple platforms at once.' },
                { icon: BarChart2, step: '03', title: 'Analyze & Grow', desc: 'Track views, likes, followers, and comments. Reply from the unified inbox. See what works and scale.' },
              ].map(({ icon: Icon, step, title, desc }) => (
                <div key={title} className="group relative flex flex-col items-center text-center z-10">
                  <div className="relative mb-6">
                    <div className="flex h-24 w-24 items-center justify-center rounded-[20px] border border-[#efe7f7] bg-white text-[#7b2cbf] shadow-sm transition-all duration-300 group-hover:shadow-md group-hover:-translate-y-1">
                      <Icon className="h-10 w-10" />
                    </div>
                    <div className="absolute -top-2 -right-2 flex h-6 w-6 items-center justify-center rounded-full bg-[linear-gradient(135deg,#7b2cbf,#d7263d)] text-[10px] font-black text-white">{step}</div>
                  </div>
                  <h3 className="text-xl font-semibold text-[#1a161f] mb-3">{title}</h3>
                  <p className="text-sm text-[#5d5768] leading-relaxed max-w-xs">{desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* PRODUCT DETAIL - glass cards */}
        <section id="product" className="relative border-t border-[#efe7f7] py-20 sm:py-28 overflow-hidden">
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute -left-20 top-1/2 -translate-y-1/2 h-[400px] w-[400px] rounded-full bg-[radial-gradient(ellipse_at_center,rgba(139,92,246,0.08)_0%,transparent_65%)]" />
          </div>
          <div className="relative mx-auto max-w-5xl px-4 sm:px-6">
            <div className="text-center mb-14">
              <h2 className="text-[28px] sm:text-4xl md:text-5xl font-bold tracking-[-0.02em] text-[#1a161f]">One product, everything you need</h2>
              <p className="mx-auto mt-4 max-w-xl text-[#5d5768]">No juggling multiple tools. One login, all platforms. Scale from solo creator to agency.</p>
              <div className="mt-8 flex justify-center">
                <button
                  type="button"
                  onClick={openSignup}
                  className="group inline-flex items-center justify-center gap-2 rounded-full bg-[linear-gradient(135deg,#7b2cbf,#d7263d)] px-8 py-4 text-base font-semibold text-white shadow-[0_10px_24px_rgba(123,44,191,0.26)] transition-all duration-300 hover:opacity-95 hover:scale-[1.03] active:scale-[0.98]"
                >
                  Get started free
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </button>
              </div>
            </div>
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {[
                { title: 'Publish everywhere', desc: 'Schedule to Instagram, YouTube, TikTok, Facebook, X, LinkedIn, and Pinterest from one calendar.', emoji: '🚀' },
                { title: 'Analytics that matter', desc: 'Views, likes, comments, followers and subscribers in one dashboard. See what works.', emoji: '📊' },
                { title: 'Unified inbox', desc: 'View and reply to DMs from Instagram, Facebook and X in one place. No more app hopping.', emoji: '💬' },
                { title: 'Smart automation', desc: 'Keyword comment replies, welcome DMs, and new-follower messages. Set it per post or account.', emoji: '⚡' },
                { title: 'Hashtag pool & AI', desc: 'Save hashtag sets and reuse them. Get AI-suggested captions with your brand voice.', emoji: '✨' },
                { title: 'White-label (Agency)', desc: 'Your logo, your colors. The dashboard looks like your brand. Multiple workspaces on higher plans.', emoji: '🏢' },
              ].map((item) => (
                <div key={item.title} className="group rounded-[20px] border border-[#efe7f7] bg-white p-6 transition-all duration-300 hover:border-[#d9c8ec] hover:shadow-md">
                  <div className="text-2xl mb-3">{item.emoji}</div>
                  <h3 className="font-semibold text-[#1a161f] mb-2">{item.title}</h3>
                  <p className="text-sm text-[#5d5768] leading-relaxed">{item.desc}</p>
                </div>
              ))}
            </div>
            <div className="mt-10 rounded-[20px] border border-[#efe7f7] bg-[#fefcff] p-6 sm:p-8">
              <ul className="space-y-3">
                {[
                  'All plans include scheduling, basic analytics, unified inbox, and AI assistant.',
                  'Keyword comment automation and higher limits on Starter and Pro.',
                  'Pro adds white-label, custom domains, smart links, and priority support.',
                ].map((item, i) => (
                  <li key={i} className="flex items-start gap-3 text-sm text-[#5d5768]">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-[#2f9e44]" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* PRICING */}
        <section className="relative border-t border-[#efe7f7] py-20 sm:py-28 overflow-hidden">
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute left-1/2 bottom-0 -translate-x-1/2 h-[400px] w-[800px] rounded-full bg-[radial-gradient(circle,rgba(139,92,246,0.3),transparent_65%)]" />
          </div>
          <div className="relative mx-auto max-w-6xl px-4 sm:px-6">
            <div className="text-center mb-10">
              <h2 className="text-[28px] sm:text-4xl font-bold tracking-[-0.02em] text-[#1a161f]">Plans for every stage</h2>
              <p className="mt-3 text-[#5d5768]">Yearly billing saves 20%. No hidden fees.</p>
            </div>
            <div className="pb-8">
              <PricingBillingToggle interval={billingInterval} onIntervalChange={setBillingInterval} />
            </div>
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 lg:gap-8">
              <PricingCard plan="free" price="$0" description="Best for trying the platform" highlights={FREE_HIGHLIGHTS} ctaText="Start Free" onCta={openSignup} billingInterval={billingInterval} />
              <PricingCard plan="starter" description="Best for creators and freelancers" highlights={STARTER_HIGHLIGHTS} priceMonthly={15} priceYearly={144} yearlyCrossedPrice={180} additionalBrandsMonthly={5} additionalBrandsYearly={48} ctaText="Get Starter" onCta={openSignup} billingInterval={billingInterval} />
              <PricingCard plan="pro" description="Best for professionals and agencies" badge="Most Popular" bestValueLabel="Best value for growing brands" highlights={PRO_HIGHLIGHTS} priceMonthly={24} priceYearly={230} yearlyCrossedPrice={288} additionalBrandsMonthly={3} additionalBrandsYearly={29} ctaText="Get Pro" onCta={openSignup} highlighted billingInterval={billingInterval} />
            </div>
            <p className="mt-10 text-center">
              <Link href="/pricing" className="text-[#7b2cbf] font-medium hover:text-[#d7263d] transition-colors">
                Compare all features and yearly pricing &rarr;
              </Link>
            </p>
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" className="border-t border-[#efe7f7] py-20 sm:py-28">
          <div className="mx-auto max-w-3xl px-4 sm:px-6">
            <div className="text-center mb-14">
              <h2 className="text-[28px] sm:text-4xl font-bold tracking-[-0.02em] text-[#1a161f]">Frequently asked questions</h2>
              <p className="mx-auto mt-4 max-w-md text-[#5d5768]">Quick answers to common questions.</p>
            </div>
            <div className="space-y-3">
              {[
                { q: 'Which platforms can I connect?', a: 'You can connect Instagram, YouTube, TikTok, Facebook, Twitter (X), LinkedIn, and Pinterest. We use each platform\'s official OAuth so you authorize access securely. Inbox and comment automation are available for Instagram, Facebook and X; scheduling and analytics support all seven platforms.' },
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

        {/* FINAL CTA - gradient CTA + glow */}
        <section className="relative border-t border-[#efe7f7] py-20 sm:py-28 overflow-hidden">
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-[500px] w-[700px] rounded-full bg-[radial-gradient(circle,rgba(139,92,246,0.35)_0%,rgba(223,68,220,0.1)_45%,transparent_70%)]" />
          </div>
          <div className="relative mx-auto max-w-2xl px-4 text-center sm:px-6">
            <h2 className="text-[28px] sm:text-4xl md:text-5xl font-bold tracking-[-0.02em] text-[#1a161f]">Ready to grow your socials?</h2>
            <p className="mt-5 text-lg text-[#5d5768]">Join creators and businesses who schedule smarter with Agent4Socials.</p>
            <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
              <button
                type="button"
                onClick={openSignup}
                className="group inline-flex items-center justify-center gap-2 rounded-full bg-[linear-gradient(135deg,#7b2cbf,#d7263d)] px-8 py-4 text-base font-semibold text-white shadow-[0_10px_24px_rgba(123,44,191,0.28)] transition-all duration-300 hover:opacity-95 hover:scale-[1.03] active:scale-[0.98]"
              >
                Get started free
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </button>
              <button type="button" onClick={openLogin} className="text-[#5d5768] hover:text-[#6f2dbd] transition-colors text-sm font-medium">
                I already have an account
              </button>
            </div>
            <p className="mt-6 text-xs text-[#8f7ca9]">No credit card required. Free plan, forever.</p>
          </div>
        </section>

      </main>
      <SiteFooter />
    </div>
  );
}
