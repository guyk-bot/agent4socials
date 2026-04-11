import Link from 'next/link';
import SiteHeader from '@/components/landing/SiteHeader';
import SiteFooter from '@/components/landing/SiteFooter';

/**
 * Public summary of automation technical limits (mirrors apps/web/docs/COMMENT_AUTOMATION.md).
 * Linked from Terms of Service.
 */
export default function HelpAutomationPage() {
  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-4 pt-24 pb-20 sm:px-6">
        <h1 className="text-3xl font-bold sm:text-4xl">Automation &amp; quotas</h1>
        <p className="mt-4 text-slate-400">
          How keyword comment automation works and the technical limits per run. This page summarizes product behavior; it is not legal advice. See also our{' '}
          <Link href="/terms" className="text-[var(--primary)] hover:opacity-90 underline">
            Terms of Service
          </Link>
          .
        </p>

        <div className="mt-10 space-y-8 text-slate-300 leading-relaxed">
          <section>
            <h2 className="text-xl font-semibold text-white">What is automated</h2>
            <p className="mt-3">
              Keyword-based comment replies (and optional Instagram DM flows where you configure them) for connected Instagram, Facebook, and X accounts. LinkedIn keyword automation is not supported in the current product. Other platforms may have inbox or manual tools but are outside this keyword automation path unless we document otherwise.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white">When it runs</h2>
            <p className="mt-3">
              On a schedule you configure (for example Vercel Cron or cron-job.org calling our API with your secret). You can also trigger runs from the dashboard. We do not guarantee a specific latency between a comment appearing on a platform and our reply being sent.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white">Technical limits (per automation run)</h2>
            <p className="mt-3">
              Each run is intentionally bounded so jobs complete and third-party APIs are not overloaded. Defaults below can be changed by the service operator using environment variables on the deployment (see operator docs in the codebase:{' '}
              <code className="text-slate-200">apps/web/docs/COMMENT_AUTOMATION.md</code>
              ).
            </p>
            <div className="mt-4 overflow-x-auto rounded-lg border border-slate-700">
              <table className="w-full min-w-[520px] text-left text-sm">
                <thead className="border-b border-slate-700 bg-slate-900/80">
                  <tr>
                    <th className="p-3 font-semibold text-white">Setting</th>
                    <th className="p-3 font-semibold text-white">Default</th>
                    <th className="p-3 font-semibold text-white">Meaning</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  <tr>
                    <td className="p-3 font-mono text-xs text-slate-200">COMMENT_AUTOMATION_MAX_POSTS</td>
                    <td className="p-3">40</td>
                    <td className="p-3">Max published posts with automation settings processed per run (most recently updated first).</td>
                  </tr>
                  <tr>
                    <td className="p-3 font-mono text-xs text-slate-200">COMMENT_AUTOMATION_MAX_META_COMMENT_PAGES</td>
                    <td className="p-3">25</td>
                    <td className="p-3">Max Graph API comment pages fetched per Instagram or Facebook post (large threads may require multiple runs).</td>
                  </tr>
                  <tr>
                    <td className="p-3 font-mono text-xs text-slate-200">COMMENT_AUTOMATION_MAX_REPLIES_PER_TARGET</td>
                    <td className="p-3">40</td>
                    <td className="p-3">Max successful replies per post target in one run; further matches wait for a later run.</td>
                  </tr>
                  <tr>
                    <td className="p-3 font-mono text-xs text-slate-200">COMMENT_AUTOMATION_MAX_TWITTER_PAGES</td>
                    <td className="p-3">8</td>
                    <td className="p-3">Max X search pagination pages per post (subject to X API rules and availability).</td>
                  </tr>
                  <tr>
                    <td className="p-3 font-mono text-xs text-slate-200">COMMENT_AUTOMATION_INTER_PAGE_DELAY_MS</td>
                    <td className="p-3">120</td>
                    <td className="p-3">Delay between paginated API requests.</td>
                  </tr>
                  <tr>
                    <td className="p-3 font-mono text-xs text-slate-200">COMMENT_AUTOMATION_INTER_REPLY_DELAY_MS</td>
                    <td className="p-3">150</td>
                    <td className="p-3">Delay after each successful reply.</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="mt-4 text-slate-400 text-sm">
              Serverless time limits also apply (see Terms). Very high comment volume may require more frequent cron runs or enterprise infrastructure; we do not warrant unlimited throughput.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white">Your compliance</h2>
            <p className="mt-3">
              You are solely responsible for keywords, reply text, frequency, and compliance with applicable law and each platform&apos;s terms, spam policies, automation rules, and advertising or messaging rules. We provide software only and do not vet your automations for legality or platform approval.
            </p>
          </section>
        </div>

        <Link href="/help" className="mt-12 inline-block text-[var(--primary)] font-medium hover:opacity-90 hover:underline">
          ← Back to Help
        </Link>
      </main>
      <SiteFooter />
    </div>
  );
}
