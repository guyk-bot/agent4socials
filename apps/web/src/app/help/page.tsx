'use client';

import React from 'react';
import Link from 'next/link';
import { HelpCircle, Mail, ChevronRight } from 'lucide-react';

const NAV_LINKS = [
  { href: '#connecting-accounts', label: 'Connecting accounts' },
  { href: '#facebook', label: 'Facebook' },
  { href: '#instagram', label: 'Instagram' },
  { href: '#tiktok', label: 'TikTok' },
  { href: '#twitter-x', label: 'X (Twitter)' },
  { href: '#youtube', label: 'YouTube' },
  { href: '#linkedin', label: 'LinkedIn' },
  { href: '#pinterest', label: 'Pinterest' },
  { href: '#analytics-limitations', label: 'Analytics limitations' },
  { href: '#growth-chart-history', label: 'Growth chart & follower history' },
  { href: '#inbox-dms', label: 'Inbox & DMs' },
  { href: '#automation-quotas', label: 'Automation & quotas' },
  { href: '#features', label: 'Features overview' },
];

export default function HelpPage() {
  return (
    <div className="max-w-4xl mx-auto pb-16">
      {/* Hero */}
      <div className="rounded-2xl border border-neutral-200 bg-white shadow-sm overflow-hidden mb-10">
        <div className="px-6 py-8 sm:px-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2.5 rounded-xl bg-[var(--primary)]/15">
              <HelpCircle className="w-6 h-6 text-[var(--primary)]" />
            </div>
            <h1 className="text-2xl font-bold text-neutral-900 tracking-tight">Help &amp; Knowledge Base</h1>
          </div>
          <p className="text-neutral-600 text-sm mt-1 max-w-xl">
            Find answers about connecting accounts, analytics limitations, inbox rules, and more. Can&apos;t find what you need? Open a support ticket.
          </p>
          <Link
            href="/help/support"
            className="mt-4 inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-[var(--button)] text-white text-sm font-medium hover:bg-[var(--button-hover)] transition-colors"
          >
            <Mail size={18} />
            Open a support ticket
            <ChevronRight size={16} />
          </Link>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-10">
        {/* Sticky nav */}
        <nav className="lg:w-52 shrink-0 lg:sticky lg:top-6 self-start" aria-label="On this page">
          <div className="rounded-xl border border-neutral-200 bg-white px-4 py-4 shadow-sm">
            <h2 className="text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-3">On this page</h2>
            <ul className="space-y-1 text-sm">
              {NAV_LINKS.map(({ href, label }) => (
                <li key={href}>
                  <a href={href} className="text-neutral-600 hover:text-[var(--primary)] hover:underline py-0.5 block">
                    {label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </nav>

        {/* Article */}
        <article className="min-w-0 flex-1 space-y-6">
          {[
            { id: 'connecting-accounts', title: 'Connecting accounts', children: (
              <p className="text-neutral-600 text-sm leading-relaxed">
                From the Dashboard (or Analytics in the sidebar), click the platform icon (Instagram, Facebook, TikTok, Pinterest, etc.) or the plus button to add an account. Each platform has different requirements: some use Meta (Facebook) login, others use their own OAuth. Only business or creator accounts are supported for Instagram and Facebook; personal accounts cannot be connected for publishing or analytics.
              </p>
            )},
            { id: 'facebook', title: 'Facebook', children: (
              <>
                <p className="text-neutral-600 text-sm leading-relaxed mb-3">
                  Connect a <strong>Facebook Page</strong> (not a personal profile). You log in with Facebook and grant the app access to manage your Page. The app can then post as the Page, read inbox messages for that Page, and pull insights (followers, reach, impressions) when the Meta Graph API allows. If you manage multiple Pages, you choose which Page to connect. Business Manager is not required for basic connection.
                </p>
                <p className="text-neutral-600 text-sm leading-relaxed">
                  <strong>Limitations:</strong> Insights depend on Meta&apos;s API; some metrics may be limited or delayed. Reconnecting from the sidebar (click the account, then reconnect) refreshes tokens if something stops working.
                </p>
              </>
            )},
            { id: 'instagram', title: 'Instagram', children: (
              <>
                <p className="text-neutral-600 text-sm leading-relaxed mb-3">
                  Only <strong>Instagram Business or Creator</strong> accounts can be connected. <strong>Personal Instagram accounts are not supported</strong> for posting, analytics, or inbox in Agent4Socials. You can connect Instagram in two ways: (1) <strong>Via Meta (Facebook)</strong> – link an Instagram Business account that is already connected to a Facebook Page; or (2) <strong>Instagram-only login</strong> – sign in with Instagram and authorize the app for that Business/Creator account.
                </p>
                <p className="text-neutral-600 text-sm leading-relaxed">
                  For full inbox (DMs) and messaging, Meta requires <strong>Advanced Access</strong> for the instagram_manage_messages permission. Until approved, only test users (in Development mode) can use messaging. Analytics (followers, impressions) are limited to the <strong>last 28 days</strong> by Instagram&apos;s API.
                </p>
              </>
            )},
            { id: 'tiktok', title: 'TikTok', children: (
              <>
                <p className="text-neutral-600 text-sm leading-relaxed mb-3">
                  You can connect <strong>personal</strong> or <strong>business</strong> TikTok accounts. The app can publish videos and pull basic analytics (followers, views) when the TikTok API permits. TikTok inbox (DMs) are <strong>not available</strong> in the app; use Instagram or Facebook for direct messages.
                </p>
                <p className="text-neutral-600 text-sm leading-relaxed">
                  If follower or view counts don&apos;t appear, reconnect the account from the Dashboard sidebar. Some metrics require TikTok to approve additional scopes.
                </p>
              </>
            )},
            { id: 'twitter-x', title: 'X (Twitter)', children: (
              <>
                <p className="text-neutral-600 text-sm leading-relaxed mb-3">
                  Connect your X (Twitter) account via OAuth. The app can post tweets and sync existing posts. <strong>Follower and tweet counts</strong> appear in analytics when the connection is valid. You can view and reply to <strong>comments</strong> on your posts in the Inbox. If you see zero or missing data, <strong>reconnect your X account</strong> from the Dashboard (click the account in the sidebar and use reconnect), or log in again when prompted.
                </p>
                <p className="text-neutral-600 text-sm leading-relaxed mb-3">
                  <strong>Direct messages (DMs):</strong> There is currently no access to X (Twitter) direct messages in the Inbox. DM support may be added in a future update.
                </p>
                <p className="text-neutral-600 text-sm leading-relaxed">
                  For posting with images, enable image upload from the Dashboard if needed.
                </p>
              </>
            )},
            { id: 'youtube', title: 'YouTube', children: (
              <>
                <p className="text-neutral-600 text-sm leading-relaxed mb-3">
                  Connect the Google account that owns your YouTube channel. The app can publish videos and fetch <strong>subscriber count</strong> and <strong>view stats</strong>. For detailed analytics (views over time, impressions), the <strong>YouTube Analytics API</strong> must be enabled in your Google Cloud project (APIs &amp; Services). If analytics are unavailable, enable &quot;YouTube Analytics API&quot; in Google Cloud Console and reconnect the account.
                </p>
                <p className="text-neutral-600 text-sm leading-relaxed">
                  Scopes such as user.info.stats may be required for follower counts; reconnect after enabling new scopes if data is missing.
                </p>
              </>
            )},
            { id: 'linkedin', title: 'LinkedIn', children: (
              <p className="text-neutral-600 text-sm leading-relaxed">
                Connect a <strong>member profile</strong> or a <strong>Company Page</strong> (organization URN) to publish, sync posts, pull comments in the Inbox, reply via the Community Management REST APIs, and see analytics when your LinkedIn app has the right <strong>products and OAuth scopes</strong> (for example r_member_social / w_member_social for members, r_organization_social / w_organization_social for Pages). Analytics can include network size, profile follower counts, org follower demographics, per-post stats from synced content, and the raw Community API debug panel on the Analytics page. Set <code className="text-xs bg-neutral-100 px-1 rounded">LINKEDIN_OAUTH_SCOPES</code> or the <code className="text-xs bg-neutral-100 px-1 rounded">LINKEDIN_*</code> toggles in your deployment env after LinkedIn approves each capability; use <code className="text-xs bg-neutral-100 px-1 rounded">LINKEDIN_REST_API_VERSION</code> (YYYYMM) to match LinkedIn&apos;s versioned REST docs. Employee advocacy and some enterprise-only flows are not built into this app; use LinkedIn&apos;s native tools where the API does not expose them.
              </p>
            )},
            { id: 'pinterest', title: 'Pinterest', children: (
              <>
                <p className="text-neutral-600 text-sm leading-relaxed mb-3">
                  Connect with <strong>Pinterest OAuth (v5)</strong> from the sidebar. We store a <strong>refresh token</strong> so scheduled posts can publish reliably. After connect, we save your <strong>first board</strong> as the default board for new Pins from the Composer.
                </p>
                <p className="text-neutral-600 text-sm leading-relaxed mb-3">
                  <strong>Publishing:</strong> Each scheduled or immediate post to Pinterest must include at least one <strong>image</strong>. Pins are created via the official API using a public image URL (same pattern as other networks that fetch media from our servers).
                </p>
                <p className="text-neutral-600 text-sm leading-relaxed mb-3">
                  <strong>Analytics:</strong> We call Pinterest&apos;s <code className="text-xs bg-neutral-100 px-1 rounded">user_account</code> and <code className="text-xs bg-neutral-100 px-1 rounded">user_account/analytics</code> endpoints. If your Pinterest app is still on <strong>trial access</strong> or lacks analytics product access, impressions time series may return 401/403. Follower counts and profile fields appear when the API allows.
                </p>
                <p className="text-neutral-600 text-sm leading-relaxed">
                  <strong>Vercel:</strong> Set <code className="text-xs bg-neutral-100 px-1 rounded">PINTEREST_APP_ID</code>, <code className="text-xs bg-neutral-100 px-1 rounded">PINTEREST_APP_SECRET</code>, and add the callback URL <code className="text-xs bg-neutral-100 px-1 rounded">/api/social/oauth/pinterest/callback</code> in the Pinterest Developer Portal. See <code className="text-xs bg-neutral-100 px-1 rounded">docs/PINTEREST_SETUP.md</code> in the repo for the full checklist.
                </p>
              </>
            )},
            { id: 'analytics-limitations', title: 'Analytics limitations', children: (
              <ul className="list-disc list-inside text-neutral-600 text-sm space-y-2">
                <li><strong>Instagram:</strong> Insights are limited to the last 28 days by Instagram&apos;s API. Older ranges are capped to 28 days.</li>
                <li><strong>Comments (Inbox):</strong> New comments on posts older than 28 days cannot be accessed; only comments on posts from the last 28 days are available. This is a platform API limitation.</li>
                <li><strong>TikTok (Inbox):</strong> TikTok&apos;s <strong>Research API</strong> can read comment text but is only for approved researchers. The <strong>Display API</strong> (used by this app for video list, publish, etc.) does not expose comment text. You can see comment counts in Analytics; we&apos;ll support TikTok comments in Inbox if TikTok adds them to an API available to developer apps.</li>
                <li><strong>Messages (Inbox):</strong> You may not see all messages in a conversation; unread/notification counts may be approximate or show as one (e.g. &quot;1&quot;) due to platform API limits. See <a href="#inbox-dms" className="text-[var(--primary)] hover:underline">Inbox & DMs</a> for details.</li>
                <li><strong>Facebook:</strong> Page insights depend on Meta&apos;s API; date ranges and metrics may be limited.</li>
                <li><strong>X (Twitter):</strong> Reconnect the account if follower or tweet counts are missing. Direct messages are not available in the Inbox; only comments are shown. DM support may be added in a future update.</li>
                <li><strong>YouTube:</strong> Enable YouTube Analytics API in Google Cloud and reconnect for full channel stats.</li>
                <li><strong>LinkedIn:</strong> Impressions and reach require LinkedIn Marketing API approval.</li>
                <li><strong>Pinterest:</strong> Account analytics depend on your Pinterest app&apos;s API access (trial vs production). Missing impressions usually means the analytics endpoint is not permitted yet for your app.</li>
                <li><strong>TikTok:</strong> Some metrics require additional API approval from TikTok.</li>
              </ul>
            )},
            { id: 'growth-chart-history', title: 'Growth chart & follower history', children: (
              <>
                <p className="text-neutral-600 text-sm leading-relaxed mb-3">
                  For <strong>Instagram</strong> and <strong>Facebook</strong>, the app stores daily snapshots of your follower (and following, for Instagram) counts from the moment you connect. The Growth chart uses this history so you see real fluctuation over time. If you just connected and there isn&apos;t enough history yet, the chart shows a flat line starting at your connection date with your current counts until more daily data is collected.
                </p>
                <p className="text-neutral-600 text-sm leading-relaxed mb-3">
                  <strong>Disconnect and reconnect:</strong> If you disconnect an account and later reconnect the same one, your historical data is preserved and the chart continues from your full history; we do not delete snapshots on disconnect.
                </p>
                <p className="text-neutral-600 text-sm leading-relaxed">
                  <strong>YouTube</strong> does not use this custom history; the Growth chart for YouTube uses only the data provided by the YouTube API (e.g. subscribers over time when available).
                </p>
              </>
            )},
            { id: 'automation-quotas', title: 'Automation & quotas', children: (
              <p className="text-neutral-600 text-sm leading-relaxed">
                Keyword comment automation runs on a schedule you configure and is subject to <strong>per-run technical limits</strong> (how many posts are scanned, how many replies per post, pagination depth, delays, and hosting time limits). Those limits are documented for transparency and are <strong>not</strong> a guarantee of delivery speed or volume. You are responsible for complying with each platform&apos;s automation and anti-spam rules. Read the full summary on{' '}
                <Link href="/help/automation" className="text-[var(--primary)] font-medium hover:underline">
                  Automation &amp; quotas
                </Link>
                {' '}and the contractual terms in our{' '}
                <Link href="/terms" className="text-[var(--primary)] font-medium hover:underline">
                  Terms of Service
                </Link>
                {' '}(Section 4).
              </p>
            )},
            { id: 'inbox-dms', title: 'Inbox & DMs', children: (
              <>
                <p className="text-neutral-600 text-sm leading-relaxed mb-3">
                  The Inbox shows <strong>comments</strong> (Instagram, Facebook, X, YouTube, TikTok) and <strong>direct messages</strong> (Instagram and Facebook only). X (Twitter) DMs are not currently available; only Twitter comments appear in the Inbox. You can reply to comments and DMs from the app. <strong>24-hour rule:</strong> For Instagram and Facebook DMs, you can only send messages within 24 hours of the customer&apos;s last message unless your app has Advanced Access for messaging.
                </p>
                <p className="text-neutral-600 text-sm leading-relaxed mb-3">
                  <strong>Comments on older posts:</strong> New comments on posts that are <strong>older than 28 days</strong> cannot be accessed. This is a platform API limitation (e.g. Instagram/Meta). Only comments on posts from the last 28 days are available in the Inbox; older posts will not show new comments.
                </p>
                <p className="text-neutral-600 text-sm leading-relaxed mb-3">
                  <strong>Message visibility and notification counts:</strong> Due to platform API capabilities (e.g. Meta/Instagram, Facebook), you may not see <strong>all messages</strong> in a conversation. The APIs may return only recent or a limited subset of messages. In addition, <strong>unread or notification counts</strong> (e.g. the number shown in the Inbox badge or next to a conversation) may be approximate or show as a single notification (e.g. &quot;1&quot;) even when there are more unread messages. The app cannot display full message history or exact unread counts when the platform does not provide them. These limitations are imposed by the social platforms, not by Agent4Socials.
                </p>
                <p className="text-neutral-600 text-sm leading-relaxed">
                  If you see an error about &quot;capability&quot; or &quot;Advanced Access&quot;, Meta requires your app to be approved for the instagram_manage_messages (and related) permission. In <strong>Development mode</strong>, both the sender and the recipient must be added as <strong>Instagram Testers</strong> in Meta for Developers (App roles → Roles), and the recipient must accept the tester invitation in Instagram (Settings → Apps and websites → Tester invitations). Reconnecting Facebook and Instagram from the sidebar after that refreshes tokens.
                </p>
              </>
            )},
            { id: 'features', title: 'Features overview', children: (
              <ul className="list-disc list-inside text-neutral-600 text-sm space-y-2">
                <li><strong>Reel Analyzer:</strong> Dedicated page to upload a short video and get a performance score and tips. Also available in Composer when you add a reel.</li>
                <li><strong>Composer:</strong> Create posts, carousels, or reels; schedule or publish to connected accounts. Use &quot;Generate with AI&quot; for captions (set up AI Assistant first).</li>
                <li><strong>Calendar:</strong> View and manage scheduled posts.</li>
                <li><strong>Automation:</strong> Set up automated comment replies from the Automation page in the sidebar. See <Link href="/help/automation" className="text-[var(--primary)] font-medium hover:underline">Automation &amp; quotas</Link> for limits and <Link href="/terms" className="text-[var(--primary)] font-medium hover:underline">Terms</Link> for your obligations.</li>
                <li><strong>AI Assistant:</strong> Add brand context and inbox/comment reply examples so the Inbox sparkle button can generate reply drafts. AI drafts are disabled until you add examples.</li>
                <li><strong>Smart Links:</strong> Create a custom link-in-bio page with your links and branding.</li>
              </ul>
            )},
          ].map(({ id, title, children }) => (
            <section
              key={id}
              id={id}
              className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm border-l-4 border-l-[var(--primary)]"
            >
              <h2 className="text-lg font-semibold text-neutral-900 mb-4">{title}</h2>
              {children}
            </section>
          ))}
        </article>
      </div>
    </div>
  );
}
