'use client';

import React from 'react';
import { Hash } from 'lucide-react';
import HashtagPoolSection from '@/components/brand-context/HashtagPoolSection';
import Link from 'next/link';

export default function HashtagPoolPage() {
  return (
    <div className="max-w-2xl mx-auto p-6 space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-neutral-900 flex items-center gap-2">
          <Hash size={28} className="text-neutral-500" />
          Hashtag Pool
        </h1>
        <p className="mt-1 text-sm text-neutral-500">
          Add your favorite hashtags here. They will be available in the Composer when you create or schedule posts so
          you can pick up to 5 per post.
        </p>
      </div>

      <HashtagPoolSection variant="page" />

      <p className="text-sm text-neutral-500">
        <Link href="/composer" prefetch className="text-[var(--button)] hover:opacity-90 font-medium">
          Open Composer
        </Link>{' '}
        to create a post and choose hashtags from this pool (up to 5 per post).
      </p>
    </div>
  );
}
