import Link from 'next/link';
import SiteHeader from '@/components/landing/SiteHeader';
import SiteFooter from '@/components/landing/SiteFooter';
import { Check } from 'lucide-react';

const features = [
  'Schedule to Instagram, YouTube & TikTok',
  'One calendar, all platforms',
  'Analytics: views, likes, comments, followers, subscribers',
  'AI: best time to post',
  'AI: generate post descriptions & captions',
  'White-label: your logo & colors',
  'Cancel anytime',
];

export default function PricingPage() {
  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <SiteHeader />
      <main className="pt-24 pb-20">
        <div className="mx-auto max-w-5xl px-4 sm:px-6">
          <h1 className="text-center text-4xl font-bold sm:text-5xl">
            Pricing
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-center text-slate-400">
            One plan. All features. Launch pricing—lock in this rate.
          </p>

          <div className="mt-16 grid gap-8 md:grid-cols-2 md:gap-10">
            <div className="rounded-2xl border-2 border-emerald-500/50 bg-slate-800/50 p-8 md:p-10">
              <p className="text-sm font-semibold uppercase tracking-wider text-emerald-400">Monthly</p>
              <p className="mt-4 text-4xl font-bold">
                $2.99
                <span className="text-xl font-normal text-slate-400">/month</span>
              </p>
              <p className="mt-2 text-slate-400">Billed monthly. Cancel anytime.</p>
              <ul className="mt-8 space-y-4">
                {features.map((f, i) => (
                  <li key={i} className="flex items-center gap-3 text-slate-300">
                    <Check className="h-5 w-5 shrink-0 text-emerald-500" />
                    {f}
                  </li>
                ))}
              </ul>
              <Link
                href="/signup"
                className="mt-10 block w-full rounded-xl bg-emerald-500 py-4 text-center text-lg font-semibold text-white transition hover:bg-emerald-400"
              >
                Get started
              </Link>
            </div>

            <div className="rounded-2xl border border-slate-700 bg-slate-800/30 p-8 md:p-10">
              <div className="flex items-center gap-2">
                <p className="text-sm font-semibold uppercase tracking-wider text-slate-400">Yearly</p>
                <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-xs font-medium text-emerald-400">
                  Save 44%
                </span>
              </div>
              <p className="mt-4 text-4xl font-bold">
                $20
                <span className="text-xl font-normal text-slate-400">/year</span>
              </p>
              <p className="mt-2 text-slate-400">Billed once. ~$1.67/month.</p>
              <ul className="mt-8 space-y-4">
                {features.map((f, i) => (
                  <li key={i} className="flex items-center gap-3 text-slate-300">
                    <Check className="h-5 w-5 shrink-0 text-emerald-500" />
                    {f}
                  </li>
                ))}
              </ul>
              <Link
                href="/signup"
                className="mt-10 block w-full rounded-xl border border-slate-600 py-4 text-center text-lg font-semibold text-white transition hover:bg-slate-700"
              >
                Get started
              </Link>
            </div>
          </div>

          <p className="mt-12 text-center text-slate-500 text-sm">
            Secure payment via Stripe (coming soon). No credit card required for free trial.
          </p>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
