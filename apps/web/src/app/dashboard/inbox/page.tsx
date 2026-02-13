'use client';

import React from 'react';
import { MessageCircle, Instagram, Facebook, Twitter, Linkedin } from 'lucide-react';
import Link from 'next/link';

export default function InboxPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-neutral-900">Inbox</h1>
        <p className="text-neutral-500 mt-1">
          Manage messages from your connected accounts in one place. YouTube does not support direct messages.
        </p>
      </div>

      <div className="card border-2 border-dashed border-neutral-200 bg-neutral-50/50 flex flex-col items-center justify-center py-16 text-center">
        <MessageCircle size={48} className="text-neutral-300 mb-4" />
        <h2 className="text-lg font-semibold text-neutral-700">Inbox coming soon</h2>
        <p className="text-sm text-neutral-500 mt-2 max-w-md">
          We&apos;re building a unified inbox for Instagram, Facebook, TikTok, X (Twitter), and LinkedIn. Connect your accounts from the Accounts page to be ready.
        </p>
        <Link
          href="/accounts"
          className="mt-6 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-neutral-900 text-white text-sm font-medium hover:bg-neutral-800 transition-colors"
        >
          Go to Accounts
        </Link>
      </div>

      <div className="card">
        <h3 className="font-semibold text-neutral-900 mb-3">Scopes needed for Inbox (when implemented)</h3>
        <p className="text-sm text-neutral-500 mb-4">
          To enable reading and replying to messages, your app must request these permissions when users connect. Add them in each platform&apos;s developer console and in the OAuth scope list when we implement the inbox API.
        </p>
        <ul className="space-y-3 text-sm">
          <li className="flex items-center gap-3">
            <Instagram size={18} className="text-pink-600 shrink-0" />
            <span><strong>Instagram</strong> (Connect via Facebook): <code className="bg-neutral-100 px-1 rounded">instagram_manage_messages</code>, <code className="bg-neutral-100 px-1 rounded">pages_messaging</code></span>
          </li>
          <li className="flex items-center gap-3">
            <Facebook size={18} className="text-blue-600 shrink-0" />
            <span><strong>Facebook</strong>: <code className="bg-neutral-100 px-1 rounded">pages_messaging</code> or <code className="bg-neutral-100 px-1 rounded">pages_messaging_subscriptions</code></span>
          </li>
          <li className="flex items-center gap-3">
            <span className="w-[18px] text-center font-bold text-neutral-800 shrink-0">TT</span>
            <span><strong>TikTok</strong>: Check TikTok for Developers for messaging / inbox permissions when available for your app type.</span>
          </li>
          <li className="flex items-center gap-3">
            <Twitter size={18} className="text-sky-500 shrink-0" />
            <span><strong>X (Twitter)</strong>: <code className="bg-neutral-100 px-1 rounded">dm.read</code>, <code className="bg-neutral-100 px-1 rounded">dm.write</code> (or equivalent in Twitter API v2).</span>
          </li>
          <li className="flex items-center gap-3">
            <Linkedin size={18} className="text-blue-700 shrink-0" />
            <span><strong>LinkedIn</strong>: Messaging product / scope in LinkedIn Developer Portal (e.g. <code className="bg-neutral-100 px-1 rounded">w_member_social</code> or dedicated messaging scope).</span>
          </li>
        </ul>
      </div>
    </div>
  );
}
