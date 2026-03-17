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

function FaqItem({ question, answer }: { question: string; answer: string }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 overflow-hidden transition-all duration-300 hover:border-white/20">
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-start justify-between gap-3 p-4 sm:p-6 text-left"
      >
        <span className="flex items-start gap-3 font-semibold text-white">
          <HelpCircle className="mt-0.5 h-5 w-5 shrink-0 text-[var(--button)]" />
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

// Order left to right on page: LinkedIn, Twitter/X, TikTok, YouTube, Facebook, Instagram (user requested right-to-left reading order)
const HERO_PLATFORMS = [
  { Icon: LinkedinIcon, label: 'LinkedIn' },
  { Icon: XTwitterIcon, label: 'Twitter/X' },
  { Icon: TikTokIcon, label: 'TikTok' },
  { Icon: YoutubeIcon, label: 'YouTube' },
  { Icon: FacebookIcon, label: 'Facebook' },
  { Icon: InstagramIcon, label: 'Instagram' },
] as const;

export default function Home() {
  const { openLogin, openSignup } = useAuthModal();
  const [billingInterval, setBillingInterval] = useState<'monthly' | 'yearly'>('yearly');

  // When Google OAuth sends user to / with #access_token=..., redirect to callback so session is set and then dashboard
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const { pathname, hash } = window.location;
    if (pathname === '/' && hash && hash.includes('access_token')) {
      window.location.replace('/auth/callback' + hash);
    }
  }, []);

  return (
    <div className="min-h-screen bg-[var(--dark)] text-white">
      <SiteHeader />
      <main>
        {/* Hero - dark minimal style */}
        <section className="relative overflow-hidden pt-24 pb-20 sm:pt-32 sm:pb-28">
          <div className="absolute bottom-0 left-0 right-0 h-64 bg-gradient-to-t from-[#b030ad]/15 via-[#6d6bcf]/10 to-transparent pointer-events-none" />
          <div className="relative mx-auto max-w-4xl px-4 sm:px-6">
            <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl md:text-5xl lg:text-6xl">
              Run your entire social media from one place
            </h1>
            <p className="mt-6 max-w-2xl text-base sm:text-lg text-slate-400 leading-relaxed">
              Schedule content, manage comments and DMs, and streamline your workflow across all platforms. Analytics, AI, smart links, and more.
            </p>
            <div className="mt-10 flex flex-col sm:flex-row items-stretch sm:items-center gap-4">
              <button
                type="button"
                onClick={openSignup}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-[var(--button)] px-6 py-3.5 text-base font-semibold text-white transition-all hover:bg-[var(--button-hover)] sm:w-auto"
              >
                Try for free
                <ArrowRight className="h-4 w-4" />
              </button>
              <Link
                href="/pricing"
                className="inline-flex items-center justify-center rounded-lg border border-white/20 bg-white/5 px-6 py-3.5 text-base font-medium text-slate-300 transition-all hover:bg-white/10 hover:text-white sm:w-auto"
              >
                See pricing
              </Link>
            </div>
            <div className="mt-14 flex flex-wrap items-center gap-6 sm:gap-8">
              {HERO_PLATFORMS.map(({ Icon, label }) => (
                <div key={label} className="flex items-center gap-2">
                  <div className="rounded-lg border border-white/10 bg-white/5 p-2.5">
                    <span className={label === 'Twitter/X' ? 'inline-block invert' : ''}>
                      <Icon size={28} />
                    </span>
                  </div>
                  <span className="text-sm text-slate-500">{label}</span>
                </div>
              ))}
            </div>
            <div className="mt-12">
              <DashboardPreview />
            </div>
          </div>
        </section>

        {/* Features */}
        <section id="features" className="border-t border-white/10 py-20 sm:py-28">
          <div className="mx-auto max-w-3xl px-4 sm:px-6">
            <h2 className="text-2xl font-bold text-white sm:text-3xl">
              Everything you need to grow
            </h2>
            <p className="mt-3 text-slate-400">
              Scheduling, analytics, unified inbox, automation, and AI. All in one place.
            </p>
            <ul className="mt-10 space-y-3">
              {[
                { icon: Calendar, label: 'Schedule posts', desc: 'Plan content for all platforms from one calendar.' },
                { icon: BarChart3, label: 'Analytics', desc: 'Views, likes, comments, followers across platforms.' },
                { icon: MessageCircle, label: 'Unified inbox', desc: 'DMs and messages from Instagram, Facebook, X in one place.' },
                { icon: MessageSquare, label: 'Comment automation', desc: 'Auto-reply on keywords, welcome DMs, per-platform text.' },
                { icon: Link2, label: 'Smart links', desc: 'One bio link, custom domains on higher plans.' },
                { icon: Hash, label: 'Hashtag pool', desc: 'Save and reuse hashtag sets.' },
                { icon: Sparkles, label: 'AI Assistant', desc: 'Brand voice and AI-suggested captions in the Composer.' },
              ].map(({ icon: Icon, label, desc }) => (
                <li key={label} className="flex items-start gap-4 rounded-xl border border-white/10 bg-white/5 px-5 py-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[var(--button)]/20 text-[var(--button)]">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-slate-100">{label}</h3>
                    <p className="mt-0.5 text-sm text-slate-400">{desc}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* How it works */}
        <section id="how-it-works" className="border-t border-white/10 bg-[var(--dark)] py-24 sm:py-32">
          <div className="mx-auto max-w-5xl px-4 sm:px-6">
            <h2 className="text-center text-3xl font-bold sm:text-4xl md:text-5xl">
              How it works
            </h2>
            <p className="mx-auto mt-6 max-w-2xl text-center text-lg text-slate-400">
              From connecting your accounts to publishing and measuring performance, here’s how Agent4Socials works.
            </p>
            <div className="mt-16 grid gap-12 md:grid-cols-3 relative">
              {/* Connector line for desktop */}
              <div className="hidden md:block absolute top-1/2 left-0 w-full h-0.5 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-y-8 z-0" />
              
              <div className="relative text-center group z-10">
                <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-2xl border border-white/10 bg-[var(--dark)] text-[#5ff6fd] shadow-xl transition-all duration-300 group-hover:-translate-y-2 group-hover:border-[#5ff6fd]/50 group-hover:shadow-[#5ff6fd]/20">
                  <Link2 className="h-9 w-9" />
                </div>
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full border border-white/10 bg-[var(--dark)] px-3 py-1 text-xs font-bold text-slate-300 group-hover:border-[#5ff6fd]/50 group-hover:text-[#5ff6fd] transition-colors">Step 1</div>
                <h3 className="mt-8 text-xl font-semibold text-slate-200">Connect</h3>
                <p className="mt-3 text-slate-400 leading-relaxed px-4 text-sm sm:text-base">Authorize Instagram, YouTube, TikTok, Facebook, X (Twitter), and LinkedIn with each platform’s official login. Your accounts appear in one dashboard so you can manage them from a single place. No passwords stored, just secure OAuth.</p>
              </div>
              
              <div className="relative text-center group z-10">
                <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-2xl border border-white/10 bg-[var(--dark)] text-[#5ff6fd] shadow-xl transition-all duration-300 group-hover:-translate-y-2 group-hover:border-[#5ff6fd]/50 group-hover:shadow-[#5ff6fd]/20">
                  <CalendarCheck className="h-9 w-9" />
                </div>
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full border border-white/10 bg-[var(--dark)] px-3 py-1 text-xs font-bold text-slate-300 group-hover:border-[#5ff6fd]/50 group-hover:text-[#5ff6fd] transition-colors">Step 2</div>
                <h3 className="mt-8 text-xl font-semibold text-slate-200">Schedule</h3>
                <p className="mt-3 text-slate-400 leading-relaxed px-4 text-sm sm:text-base">Use the Composer to create posts, add captions and media, and pick date and time. Publish to one or multiple platforms at once. Use the Calendar to see what’s going out when, or lean on AI to suggest captions. We post for you at the scheduled time.</p>
              </div>
              
              <div className="relative text-center group z-10">
                <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-2xl border border-white/10 bg-[var(--dark)] text-[#5ff6fd] shadow-xl transition-all duration-300 group-hover:-translate-y-2 group-hover:border-[#5ff6fd]/50 group-hover:shadow-[#5ff6fd]/20">
                  <BarChart2 className="h-9 w-9" />
                </div>
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full border border-white/10 bg-[var(--dark)] px-3 py-1 text-xs font-bold text-slate-300 group-hover:border-[#5ff6fd]/50 group-hover:text-[#5ff6fd] transition-colors">Step 3</div>
                <h3 className="mt-8 text-xl font-semibold text-slate-200">Analyze & engage</h3>
                <p className="mt-3 text-slate-400 leading-relaxed px-4 text-sm sm:text-base">View views, likes, comments, followers, and subscribers in one analytics dashboard. Reply to DMs and comments from the unified Inbox, use Smart Links for bio links, and export or white-label reports. See what works and grow from one place.</p>
              </div>
            </div>
          </div>
        </section>

        {/* Product detail */}
        <section id="product" className="border-t border-white/10 py-16 sm:py-24">
          <div className="mx-auto max-w-5xl px-4 sm:px-6">
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
                <div key={i} className="rounded-2xl border border-white/10 bg-white/5 p-5 sm:p-6 text-left hover:border-white/20 hover:bg-white/10 transition-all">
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
                  <Check className="mt-0.5 h-5 w-5 shrink-0 text-[#b030ad]" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Pricing */}
        <section className="border-t border-white/10 py-16 sm:py-24">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <h2 className="text-2xl font-bold text-white sm:text-3xl">
              Plans for every stage
            </h2>
            <p className="mt-2 text-slate-400">
              Yearly billing saves 20%. No hidden fees.
            </p>
            <div className="mt-10 pb-8">
              <PricingBillingToggle
                interval={billingInterval}
                onIntervalChange={setBillingInterval}
                dark
              />
            </div>
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 lg:gap-8">
              <PricingCard
                plan="free"
                price="$0"
                description="Best for trying the platform"
                highlights={FREE_HIGHLIGHTS}
                ctaText="Start Free"
                onCta={openSignup}
                billingInterval={billingInterval}
                dark
              />
              <PricingCard
                plan="starter"
                description="Best for creators and freelancers"
                highlights={STARTER_HIGHLIGHTS}
                priceMonthly={15}
                priceYearly={144}
                yearlyCrossedPrice={180}
                additionalBrandsMonthly={5}
                additionalBrandsYearly={48}
                ctaText="Get Starter"
                onCta={openSignup}
                billingInterval={billingInterval}
                dark
              />
              <PricingCard
                plan="pro"
                description="Best for professionals and agencies"
                badge="Most Popular"
                bestValueLabel="⭐ Best value for growing brands"
                highlights={PRO_HIGHLIGHTS}
                priceMonthly={24}
                priceYearly={230}
                yearlyCrossedPrice={288}
                additionalBrandsMonthly={3}
                additionalBrandsYearly={29}
                ctaText="Get Pro"
                onCta={openSignup}
                highlighted
                billingInterval={billingInterval}
                dark
              />
            </div>
            <p className="mt-10 text-center">
              <Link href="/pricing" className="text-[var(--button)] font-medium hover:underline">
                Compare all features and yearly pricing →
              </Link>
            </p>
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" className="border-t border-white/10 bg-[var(--dark)]/40 py-16 sm:py-24 md:py-32">
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
                  q: 'How do I get started?',
                  a: 'You can try for free with the Free plan (no credit card required), or sign up for Starter or Pro to unlock more features. Connect your accounts and start scheduling, managing your inbox, and viewing analytics from one dashboard.',
                },
                {
                  q: 'Which plan is right for me?',
                  a: 'Free is for trying the platform: 1 brand, 50 scheduled posts per month, 30 days analytics, and limited AI. Starter ($15/mo) is for creators and freelancers: 1 brand, unlimited scheduling, inbox, X and LinkedIn, 6 months analytics, unlimited AI, and export reports. Pro ($39/mo) is for professionals and agencies: advanced analytics, bulk replies, keyword triggers, 10 smart link pages, custom domains, white-label, and priority support. Yearly billing saves 20%.',
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
        <section className="border-t border-white/10 py-16 sm:py-24">
          <div className="mx-auto max-w-2xl px-4 text-center sm:px-6">
            <h2 className="text-2xl font-bold text-white sm:text-3xl">
              Ready to grow your socials?
            </h2>
            <p className="mt-3 text-slate-400">
              Join creators and businesses who schedule smarter with Agent4Socials.
            </p>
            <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4">
              <button
                type="button"
                onClick={openSignup}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-[var(--button)] px-6 py-3.5 font-semibold text-white hover:bg-[var(--button-hover)] transition-colors w-full sm:w-auto"
              >
                Try for free
                <ArrowRight className="h-4 w-4" />
              </button>
              <button type="button" onClick={openLogin} className="text-slate-400 hover:text-white transition-colors text-sm font-medium">
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
