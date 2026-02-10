import Link from 'next/link';
import SiteHeader from '@/components/landing/SiteHeader';
import SiteFooter from '@/components/landing/SiteFooter';

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-4 pt-24 pb-20 sm:px-6">
        <h1 className="text-3xl font-bold sm:text-4xl">Terms of Service</h1>
        <p className="mt-4 text-slate-400">Last updated: February 2025</p>

        <div className="mt-10 space-y-10 text-slate-300">
          <section>
            <h2 className="text-xl font-semibold text-white">1. Acceptance of terms</h2>
            <p className="mt-3 leading-relaxed">
              By accessing or using Agent4Socials (&quot;Service&quot;), you agree to be bound by these Terms of Service.
              If you do not agree, do not use the Service. We may update these terms from time to time; continued use
              after changes constitutes acceptance.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white">2. Description of service</h2>
            <p className="mt-3 leading-relaxed">
              Agent4Socials provides a platform to schedule posts and view analytics across connected social media
              accounts (Instagram, YouTube, TikTok, Facebook, Twitter, LinkedIn). We do not guarantee uninterrupted
              availability and may modify or discontinue features with reasonable notice where practicable.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white">3. Your obligations</h2>
            <p className="mt-3 leading-relaxed">
              You must use the Service in compliance with these terms and with each platform&apos;s terms (Instagram,
              YouTube, TikTok, Facebook, X/Twitter, LinkedIn). You are responsible for your account credentials, the
              content you post, and ensuring your use does not violate any applicable law or third-party rights. You
              may not misuse the Service, attempt to gain unauthorized access, or use it for spam or illegal activity.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white">4. Content and intellectual property</h2>
            <p className="mt-3 leading-relaxed">
              You retain ownership of content you create and post. By using the Service you grant us the limited rights
              necessary to operate the Service (e.g. sending your content to the platforms you connect). Our name,
              logo, and the Service&apos;s design and code remain our intellectual property.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white">5. Payment and cancellation</h2>
            <p className="mt-3 leading-relaxed">
              Paid plans are billed as described on the pricing page. You may cancel at any time; access continues until
              the end of the current billing period. We do not provide refunds for partial periods. We may change
              pricing with advance notice.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white">6. Termination</h2>
            <p className="mt-3 leading-relaxed">
              We may suspend or terminate your access if you breach these terms or for other operational reasons. You
              may stop using the Service at any time. Sections that by their nature should survive (e.g. liability
              limits, dispute resolution) will survive termination.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white">7. Disclaimer of warranties</h2>
            <p className="mt-3 leading-relaxed">
              The Service is provided &quot;as is.&quot; We disclaim all warranties, express or implied, including
              merchantability and fitness for a particular purpose. We do not warrant that the Service will be
              error-free or that integrations with third-party platforms will always be available.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white">8. Limitation of liability</h2>
            <p className="mt-3 leading-relaxed">
              To the maximum extent permitted by law, Agent4Socials and its affiliates shall not be liable for any
              indirect, incidental, special, consequential, or punitive damages, or for loss of data, revenue, or
              profits. Our total liability for any claim arising from your use of the Service shall not exceed the
              amount you paid us in the twelve months before the claim.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white">9. Contact</h2>
            <p className="mt-3 leading-relaxed">
              For questions about these terms, use the contact or support option provided in the app or on our website.
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
