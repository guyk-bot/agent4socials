import Link from 'next/link';
import SiteHeader from '@/components/landing/SiteHeader';
import SiteFooter from '@/components/landing/SiteFooter';

export default function DataDeletionPage() {
  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-4 pt-24 pb-20 sm:px-6">
        <h1 className="text-3xl font-bold sm:text-4xl">Data deletion</h1>
        <p className="mt-4 text-slate-400">How to request deletion of your data from Agent4Socials</p>

        <div className="mt-10 space-y-6 text-slate-300">
          <section>
            <p className="leading-relaxed">
              To request deletion of your data from Agent4Socials, you can do either of the following:
            </p>
            <ul className="mt-4 list-disc list-inside space-y-2 leading-relaxed">
              <li>
                <strong className="text-white">From the app:</strong> Log in to Agent4Socials, go to Account or
                Settings, and use &quot;Delete my account&quot; (or the equivalent option). This will remove your
                account and associated data.
              </li>
              <li>
                <strong className="text-white">By email:</strong> Send an email to{' '}
                <a href="mailto:support@agent4socials.com" className="text-emerald-400 hover:text-emerald-300 underline">
                  support@agent4socials.com
                </a>{' '}
                with the subject line &quot;Data deletion request&quot; and we will process your request.
              </li>
            </ul>
            <p className="mt-4 leading-relaxed">
              We will delete your data within 30 days of receiving a valid request.
            </p>
          </section>
        </div>

        <Link href="/" className="mt-12 inline-block text-emerald-400 font-medium hover:text-emerald-300 hover:underline">
          ← Back to home
        </Link>
      </main>
      <SiteFooter />
    </div>
  );
}
