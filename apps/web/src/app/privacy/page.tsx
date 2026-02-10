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
              Agent4Socials (&quot;we,&quot; &quot;us&quot;) respects your privacy. This policy describes what data we
              collect, how we use it, and your choices. By using our service you agree to this policy.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white">2. Data we collect</h2>
            <p className="mt-3 leading-relaxed">
              We collect: (a) account information you provide (email, name, password); (b) data from connected social
              accounts (e.g. profile info, posts, analytics) necessary to provide scheduling and analytics; (c) usage
              data such as how you use the product (e.g. pages visited, actions taken); (d) technical data such as IP
              address and browser type. We do not sell your personal data.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white">3. How we use your data</h2>
            <p className="mt-3 leading-relaxed">
              We use your data to provide and improve the Service (scheduling, analytics, support), to communicate with
              you about your account or the product, to ensure security and prevent abuse, and to comply with legal
              obligations. We may use aggregated or anonymized data for analytics and product improvement.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white">4. Sharing and disclosure</h2>
            <p className="mt-3 leading-relaxed">
              We share data only as needed: (a) with the social platforms you connect (to post and retrieve analytics
              on your behalf); (b) with service providers who help us operate the Service (e.g. hosting, payments),
              under strict confidentiality; (c) if required by law or to protect our rights and safety. We do not sell
              or rent your personal information to third parties.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white">5. Data retention and security</h2>
            <p className="mt-3 leading-relaxed">
              We retain your data for as long as your account is active or as needed to provide the Service and comply
              with law. We implement appropriate technical and organizational measures to protect your data against
              unauthorized access, loss, or misuse.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white">6. Your rights</h2>
            <p className="mt-3 leading-relaxed">
              Depending on where you live, you may have the right to access, correct, delete, or port your data, or to
              object to or restrict certain processing. You can update account details in settings and request
              deletion by contacting us. If you are in the EEA/UK you may also lodge a complaint with a supervisory
              authority.
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
            <h2 className="text-xl font-semibold text-white">9. Contact</h2>
            <p className="mt-3 leading-relaxed">
              For privacy-related questions or to exercise your rights, use the contact or support option provided in
              the app or on our website.
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
