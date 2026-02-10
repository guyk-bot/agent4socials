import Link from 'next/link';
import SiteHeader from '@/components/landing/SiteHeader';
import SiteFooter from '@/components/landing/SiteFooter';

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-4 pt-24 pb-20 sm:px-6">
        <h1 className="text-3xl font-bold">Terms of Service</h1>
        <p className="mt-4 text-slate-400">Last updated: {new Date().toLocaleDateString()}</p>
        <div className="prose prose-invert mt-8 space-y-6 text-slate-300">
          <p>
            By using Agent4Socials you agree to use the service in compliance with the terms of Instagram,
            YouTube, and TikTok. You are responsible for your content and for keeping your account secure.
          </p>
          <p>
            We may update these terms. Continued use after changes constitutes acceptance. For support,
            use the contact option in the app.
          </p>
        </div>
        <Link href="/" className="mt-10 inline-block text-emerald-400 hover:underline">← Back to home</Link>
      </main>
      <SiteFooter />
    </div>
  );
}
