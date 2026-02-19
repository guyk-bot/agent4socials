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
              By accessing or using Agent4Socials (&quot;Service&quot;, &quot;we,&quot; &quot;us&quot;), you agree to be bound by these Terms of Service and our <Link href="/privacy" className="text-emerald-400 hover:text-emerald-300 underline">Privacy Policy</Link>. If you do not agree, do not use the Service. We may update these terms from time to time; we will post the updated version on this page and update the &quot;Last updated&quot; date. Continued use after changes constitutes acceptance.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white">2. Description of service</h2>
            <p className="mt-3 leading-relaxed">
              Agent4Socials provides a platform that allows you to:
            </p>
            <ul className="mt-3 list-disc list-inside space-y-2 leading-relaxed">
              <li>Connect your social media accounts (Instagram, YouTube, TikTok, Facebook, X/Twitter, LinkedIn) via each platform&apos;s official authorization (OAuth).</li>
              <li>Schedule and publish posts (including captions, media, and hashtags) to one or more connected accounts from a single calendar and composer.</li>
              <li>View analytics (e.g. views, likes, comments, followers, subscribers) from your connected accounts in one dashboard.</li>
              <li>Use a unified inbox to view and reply to direct messages and conversations from Instagram, Facebook, and X.</li>
              <li>Set up automation: keyword-based comment auto-replies (including optional private/DM replies on Instagram) with configurable reply text per platform (Instagram, Facebook, X), and optional welcome or new-follower messages when someone messages or follows you.</li>
              <li>Use a hashtag pool to save and reuse hashtag sets, and an AI Assistant to set brand context and receive AI-suggested captions or content ideas.</li>
              <li>Apply white-label options (e.g. your logo and colors) where offered.</li>
            </ul>
            <p className="mt-3 leading-relaxed">
              We do not guarantee uninterrupted availability. We may modify, suspend, or discontinue features with reasonable notice where practicable. The Service is provided &quot;as is&quot; subject to the disclaimers in Section 7.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white">3. Your obligations</h2>
            <p className="mt-3 leading-relaxed">
              You must use the Service in compliance with these terms and with each platform&apos;s terms and policies, including but not limited to: Meta (Facebook, Instagram), TikTok, Google (YouTube), X (Twitter), and LinkedIn. You are responsible for your account credentials, the content you post, and ensuring your use does not violate any applicable law or third-party rights.
            </p>
            <p className="mt-3 leading-relaxed">
              You may not misuse the Service, attempt to gain unauthorized access, use it for spam or illegal activity, or configure automation (e.g. comment replies or welcome messages) in a way that violates any platform&apos;s policies. You are responsible for the keywords, reply text, and messages you set for comment and DM automation; we do not control how platforms treat automated replies and messaging, and you must comply with their rules (e.g. messaging windows, prohibited content).
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white">4. Content and intellectual property</h2>
            <p className="mt-3 leading-relaxed">
              You retain ownership of content you create and post. By using the Service you grant us the limited rights necessary to operate the Service (e.g. sending your content to the platforms you connect, storing and processing it for scheduling, analytics, inbox, and automation). Our name, logo, and the Service&apos;s design and code remain our intellectual property. You may not copy, reverse-engineer, or misuse our branding or technology except as permitted by these terms.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white">5. Payment and cancellation</h2>
            <p className="mt-3 leading-relaxed">
              Paid plans are billed as described on the <Link href="/pricing" className="text-emerald-400 hover:text-emerald-300 underline">pricing page</Link> (e.g. 7-day free trial, then monthly or yearly subscription). You may cancel at any time; access continues until the end of the current billing period. We do not provide refunds for partial periods. We may change pricing with advance notice. You are responsible for any applicable taxes.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white">6. Termination</h2>
            <p className="mt-3 leading-relaxed">
              We may suspend or terminate your access if you breach these terms or for other operational or legal reasons. You may stop using the Service at any time and delete your account. Sections that by their nature should survive (e.g. liability limits, dispute resolution, intellectual property) will survive termination.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white">7. Disclaimer of warranties</h2>
            <p className="mt-3 leading-relaxed">
              The Service is provided &quot;as is&quot; and &quot;as available.&quot; We disclaim all warranties, express or implied, including merchantability and fitness for a particular purpose. We do not warrant that the Service will be error-free, uninterrupted, or that integrations with third-party platforms (Meta, TikTok, Google, X, LinkedIn) will always be available or function as expected. Your use of the Service and any reliance on automation, analytics, or platform features is at your own risk.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white">8. Limitation of liability</h2>
            <p className="mt-3 leading-relaxed">
              To the maximum extent permitted by law, Agent4Socials and its affiliates shall not be liable for any indirect, incidental, special, consequential, or punitive damages, or for loss of data, revenue, or profits. Our total liability for any claim arising from your use of the Service shall not exceed the amount you paid us in the twelve months before the claim.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white">9. Contact</h2>
            <p className="mt-3 leading-relaxed">
              For questions about these terms, contact us at <a href="mailto:support@agent4socials.com" className="text-emerald-400 hover:text-emerald-300 underline">support@agent4socials.com</a> or use the contact or support option in the app or on our website. For data deletion requests, see our <Link href="/data-deletion" className="text-emerald-400 hover:text-emerald-300 underline">Data Deletion</Link> page and <Link href="/privacy" className="text-emerald-400 hover:text-emerald-300 underline">Privacy Policy</Link>.
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
