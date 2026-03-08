'use client';

import React, { useState } from 'react';
import { HelpCircle, Mail, ChevronRight, Send, CheckCircle, AlertCircle } from 'lucide-react';
import api from '@/lib/api';
import { useAuth } from '@/context/AuthContext';

const SUPPORT_EMAIL = 'support@agent4socials.com';

const NAV_LINKS = [
  { href: '#connecting-accounts', label: 'Connecting accounts' },
  { href: '#facebook', label: 'Facebook' },
  { href: '#instagram', label: 'Instagram' },
  { href: '#tiktok', label: 'TikTok' },
  { href: '#twitter-x', label: 'X (Twitter)' },
  { href: '#youtube', label: 'YouTube' },
  { href: '#linkedin', label: 'LinkedIn' },
  { href: '#analytics-limitations', label: 'Analytics limitations' },
  { href: '#inbox-dms', label: 'Inbox & DMs' },
  { href: '#features', label: 'Features overview' },
  { href: '#support-ticket', label: 'Support ticket' },
];

export default function HelpPage() {
  const { user } = useAuth();
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) return;
    setStatus('sending');
    setErrorMessage('');
    try {
      await api.post('/support', { subject: subject.trim() || undefined, message: message.trim() });
      setStatus('success');
      setSubject('');
      setMessage('');
    } catch (err: unknown) {
      setStatus('error');
      const msg = err && typeof err === 'object' && 'response' in err && err.response && typeof (err.response as { data?: { message?: string } }).data?.message === 'string'
        ? (err.response as { data: { message: string } }).data.message
        : 'Something went wrong. Please try again or email us directly.';
      setErrorMessage(msg);
    }
  };

  return (
    <div className="max-w-4xl mx-auto pb-16">
      {/* Hero */}
      <div className="rounded-2xl border border-neutral-200 bg-white shadow-sm overflow-hidden mb-10">
        <div className="px-6 py-8 sm:px-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2.5 rounded-xl bg-indigo-100">
              <HelpCircle className="w-6 h-6 text-indigo-600" />
            </div>
            <h1 className="text-2xl font-bold text-neutral-900 tracking-tight">Help &amp; Knowledge Base</h1>
          </div>
          <p className="text-neutral-600 text-sm mt-1 max-w-xl">
            Find answers about connecting accounts, analytics limitations, inbox rules, and more. Can&apos;t find what you need? Open a support ticket below.
          </p>
          <a
            href="#support-ticket"
            className="mt-4 inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 transition-colors"
          >
            <Mail size={18} />
            Open a support ticket
            <ChevronRight size={16} />
          </a>
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
                  <a href={href} className="text-neutral-600 hover:text-indigo-600 hover:underline py-0.5 block">
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
                From the Dashboard (or Analytics in the sidebar), click the platform icon (Instagram, Facebook, TikTok, etc.) or the plus button to add an account. Each platform has different requirements: some use Meta (Facebook) login, others use their own OAuth. Only business or creator accounts are supported for Instagram and Facebook; personal accounts cannot be connected for publishing or analytics.
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
                  Connect your X (Twitter) account via OAuth. The app can post tweets and sync existing posts. <strong>Follower and tweet counts</strong> appear in analytics when the connection is valid. If you see zero or missing data, <strong>reconnect your X account</strong> from the Dashboard (click the account in the sidebar and use reconnect), or log in again when prompted.
                </p>
                <p className="text-neutral-600 text-sm leading-relaxed">
                  For posting with images, the app must have Read and write permissions in the X Developer Portal. Enable image upload from the Dashboard if needed.
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
                Connect your LinkedIn account to publish posts and view basic profile data. <strong>Connection count</strong> and <strong>post publishing</strong> are available. Advanced analytics (impressions, reach, engagement breakdown) require <strong>LinkedIn Marketing API</strong> approval from LinkedIn. Until then, those metrics will not appear; you can still schedule and publish content.
              </p>
            )},
            { id: 'analytics-limitations', title: 'Analytics limitations', children: (
              <ul className="list-disc list-inside text-neutral-600 text-sm space-y-2">
                <li><strong>Instagram:</strong> Insights are limited to the last 28 days by Instagram&apos;s API. Older ranges are capped to 28 days.</li>
                <li><strong>Facebook:</strong> Page insights depend on Meta&apos;s API; date ranges and metrics may be limited.</li>
                <li><strong>X (Twitter):</strong> Reconnect the account if follower or tweet counts are missing.</li>
                <li><strong>YouTube:</strong> Enable YouTube Analytics API in Google Cloud and reconnect for full channel stats.</li>
                <li><strong>LinkedIn:</strong> Impressions and reach require LinkedIn Marketing API approval.</li>
                <li><strong>TikTok:</strong> Some metrics require additional API approval from TikTok.</li>
              </ul>
            )},
            { id: 'inbox-dms', title: 'Inbox & DMs', children: (
              <>
                <p className="text-neutral-600 text-sm leading-relaxed mb-3">
                  The Inbox shows <strong>comments</strong> (Instagram, Facebook, X, YouTube) and <strong>direct messages</strong> (Instagram and Facebook only). You can reply to comments and DMs from the app. <strong>24-hour rule:</strong> For Instagram and Facebook DMs, you can only send messages within 24 hours of the customer&apos;s last message unless your app has Advanced Access for messaging.
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
                <li><strong>Automation:</strong> Set up automated comment replies (e.g. from the Automation page in the sidebar).</li>
                <li><strong>AI Assistant:</strong> Add brand context and inbox/comment reply examples so the Inbox sparkle button can generate reply drafts. AI drafts are disabled until you add examples.</li>
                <li><strong>Smart Links:</strong> Create a custom link-in-bio page with your links and branding.</li>
              </ul>
            )},
          ].map(({ id, title, children }) => (
            <section
              key={id}
              id={id}
              className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm border-l-4 border-l-indigo-500"
            >
              <h2 className="text-lg font-semibold text-neutral-900 mb-4">{title}</h2>
              {children}
            </section>
          ))}

          {/* Support ticket form */}
          <section id="support-ticket" className="rounded-xl border-2 border-indigo-200 bg-indigo-50/50 p-6 shadow-sm border-l-4 border-l-indigo-600">
            <h2 className="text-lg font-semibold text-neutral-900 mb-2">Open a support ticket</h2>
            <p className="text-neutral-600 text-sm leading-relaxed mb-5">
              Can&apos;t find what you need? Send us a message and we&apos;ll get back to you. Your ticket will be sent from your account email.
            </p>

            {status === 'success' && (
              <div className="mb-5 flex items-center gap-2 rounded-lg bg-green-50 text-green-800 px-4 py-3 text-sm">
                <CheckCircle size={20} className="shrink-0" />
                <span>Your ticket was sent. We&apos;ll reply to {user?.email || 'your email'} as soon as we can.</span>
              </div>
            )}
            {status === 'error' && (
              <div className="mb-5 flex items-start gap-2 rounded-lg bg-red-50 text-red-800 px-4 py-3 text-sm">
                <AlertCircle size={20} className="shrink-0 mt-0.5" />
                <div>
                  <p>{errorMessage}</p>
                  <p className="mt-1">You can also email us directly: <a href={`mailto:${SUPPORT_EMAIL}`} className="font-medium underline">{SUPPORT_EMAIL}</a></p>
                </div>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              {user?.email && (
                <div>
                  <label htmlFor="support-email" className="block text-xs font-medium text-neutral-500 mb-1">From (your account)</label>
                  <input
                    id="support-email"
                    type="email"
                    value={user.email}
                    readOnly
                    className="w-full rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm text-neutral-600"
                  />
                </div>
              )}
              <div>
                <label htmlFor="support-subject" className="block text-xs font-medium text-neutral-500 mb-1">Subject (optional)</label>
                <input
                  id="support-subject"
                  type="text"
                  placeholder="e.g. Can't connect Instagram"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  maxLength={200}
                  className="w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-900 placeholder:text-neutral-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label htmlFor="support-message" className="block text-xs font-medium text-neutral-500 mb-1">Message <span className="text-red-500">*</span></label>
                <textarea
                  id="support-message"
                  placeholder="Describe your question or issue..."
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  required
                  rows={5}
                  maxLength={10000}
                  className="w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-900 placeholder:text-neutral-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 resize-y min-h-[120px]"
                />
              </div>
              <button
                type="submit"
                disabled={status === 'sending' || !message.trim()}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:pointer-events-none transition-colors"
              >
                {status === 'sending' ? (
                  <>Sending...</>
                ) : (
                  <>
                    <Send size={18} />
                    Send ticket
                  </>
                )}
              </button>
            </form>

            <p className="text-neutral-500 text-xs mt-4">
              Or email us directly: <a href={`mailto:${SUPPORT_EMAIL}`} className="text-indigo-600 hover:underline">{SUPPORT_EMAIL}</a>
            </p>
          </section>
        </article>
      </div>
    </div>
  );
}
