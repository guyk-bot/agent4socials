import Link from 'next/link';
import SiteHeader from '@/components/landing/SiteHeader';
import SiteFooter from '@/components/landing/SiteFooter';

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-4 pt-24 pb-20 sm:px-6">
        <h1 className="text-3xl font-bold sm:text-4xl">Privacy Policy</h1>
        <p className="mt-4 text-slate-400">Last updated: February 2025</p>

        <div className="mt-10 space-y-10 text-slate-300">
          <section>
            <h2 className="text-xl font-semibold text-white">1. Introduction</h2>
            <p className="mt-3 leading-relaxed">
              Agent4Socials (&quot;we,&quot; &quot;us,&quot; &quot;our&quot;) respects your privacy. This Privacy Policy describes what data we collect, how we use it, with whom we share it, and your choices and rights. By using our website and service (the &quot;Service&quot;), you agree to this policy.
            </p>
            <p className="mt-3 leading-relaxed">
              Our Service integrates with Meta (Facebook and Instagram), TikTok, Google (YouTube), X (Twitter), and LinkedIn. When you connect an account, we access and process data in accordance with each platform&apos;s policies and your authorizations. This policy is intended to satisfy disclosure requirements for app verification and review by those platforms.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white">2. Data we collect</h2>
            <p className="mt-3 leading-relaxed">
              We collect: (a) <strong className="text-white">Account information</strong> you provide (email, name, password); (b) <strong className="text-white">Connected social account data</strong> from Instagram, YouTube, TikTok, Facebook, X, and LinkedIn: profile info, posts, comments on your posts (for keyword comment automation), direct messages and conversations (for unified inbox and welcome/new-follower messages), and analytics (views, likes, followers, etc.); (c) <strong className="text-white">Content and settings</strong> you create (scheduled posts, hashtag sets, brand context for AI Assistant, automation keywords and reply templates); (d) <strong className="text-white">Usage and technical data</strong> (how you use the product, IP address, browser type). We do not sell your personal data.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white">3. How we use your data</h2>
            <p className="mt-3 leading-relaxed">
              We use your data to provide the Service: scheduling and publishing posts; displaying analytics; unified inbox and replying to messages; comment automation (auto-reply when someone comments a keyword, including optional DM replies on Instagram) and welcome/new-follower messages; hashtag pool and AI Assistant features. We also use data to improve the Service, communicate with you, ensure security and prevent abuse, and comply with legal obligations. We may use aggregated or anonymized data for product improvement.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white">4. Sharing and disclosure</h2>
            <p className="mt-3 leading-relaxed">
              We share data only as needed: (a) with the social platforms you connect (Meta, TikTok, Google, X, LinkedIn) to post content, reply to comments, send messages, and retrieve analytics and inbox data on your behalf; (b) with service providers (hosting, payments, email) under strict confidentiality; (c) if required by law or to protect our rights and safety. We do not sell or rent your personal information to third parties.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white">5. Data retention and security</h2>
            <p className="mt-3 leading-relaxed">
              We retain your data for as long as your account is active or as needed to provide the Service and comply with law. When you delete your account or request data deletion, we delete or anonymize your data as described in our <Link href="/data-deletion" className="text-emerald-400 hover:text-emerald-300 underline">Data Deletion</Link> page. We implement appropriate measures to protect your data against unauthorized access, loss, or misuse.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white">6. Your rights</h2>
            <p className="mt-3 leading-relaxed">
              Depending on where you live, you may have the right to access, correct, delete, or port your data, or to object to or restrict certain processing. You can update account details in settings. To request deletion, use the option in Account or Settings or see our <Link href="/data-deletion" className="text-emerald-400 hover:text-emerald-300 underline">Data Deletion</Link> page. If you are in the EEA/UK you may also lodge a complaint with a supervisory authority.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white">7. Cookies and similar technologies</h2>
            <p className="mt-3 leading-relaxed">
              We use cookies and similar technologies to keep you logged in, remember preferences, and understand how
              the site is used. You can control cookies through your browser settings; some features may not work
              correctly if you disable them.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white">8. Changes to this policy</h2>
            <p className="mt-3 leading-relaxed">
              We may update this policy from time to time. We will post the updated version on this page and update the
              &quot;Last updated&quot; date. Continued use of the Service after changes constitutes acceptance.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white">9. Contact and data deletion</h2>
            <p className="mt-3 leading-relaxed">
              For privacy-related questions or to exercise your rights, contact us at <a href="mailto:support@agent4socials.com" className="text-emerald-400 hover:text-emerald-300 underline">support@agent4socials.com</a> or use the contact option in the app or on our website. To request deletion of your data, you can delete your account from Account or Settings, or send a &quot;Data deletion request&quot; to support@agent4socials.com. We process valid requests within 30 days. See our <Link href="/data-deletion" className="text-emerald-400 hover:text-emerald-300 underline">Data Deletion</Link> page for details.
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
