'use client';

import React from 'react';
import Link from 'next/link';
import { Bot } from 'lucide-react';
import { BRAND_NAME } from '@/lib/site-brand-assets';
import AysopChatPanel from '@/components/aysop/AysopChatPanel';

export default function IzopAIPage() {
  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-6">
        <div className="flex items-center gap-2">
          <Bot size={28} className="text-[var(--primary)]" />
          <h1 className="text-2xl font-bold text-neutral-900">{BRAND_NAME} AI</h1>
        </div>
        <p className="mt-1 text-sm text-neutral-500">
          Chat with your social copilot: analytics from connected accounts, comment insights, keyword
          automations, and captions for posts, carousels, and video.{' '}
          <Link href="/dashboard/ai-assistant" className="text-[var(--primary)] hover:underline">
            Brand voice
          </Link>{' '}
          from AI Assistant improves drafts.
        </p>
      </div>
      <AysopChatPanel />
    </div>
  );
}
