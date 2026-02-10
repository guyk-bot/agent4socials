import Link from 'next/link';
import SiteHeader from '@/components/landing/SiteHeader';
import SiteFooter from '@/components/landing/SiteFooter';

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-4 pt-24 pb-20 sm:px-6">
        <h1 className="text-3xl font-bold">Privacy Policy</h1>
        <p className="mt-4 text-slate-400">Last updated: {new Date().toLocaleDateString()}</p>
        <div className="prose prose-invert mt-8 space-y-6 text-slate-300">
          <p>
            Agent4Socials (&quot;we&quot;) respects your privacy. We collect only what is needed to provide scheduling,
            analytics, and AI features for your connected social accounts. We do not sell your data.
          </p>
          <p>
            By using our service you agree to this policy. For questions, contact us at the support email
            provided in the app.
          </p>
        </div>
        <Link href="/" className="mt-10 inline-block text-emerald-400 hover:underline">← Back to home</Link>
      </main>
      <SiteFooter />
    </div>
  );
}
