'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Hash, Plus, X } from 'lucide-react';

const HASHTAG_POOL_KEY = 'agent4socials_hashtag_pool';

function normalizeHashtag(t: string): string {
  const s = t.trim().replace(/^#+/, '');
  return s ? `#${s}` : '';
}

export default function HashtagPoolPage() {
  const [pool, setPool] = useState<string[]>([]);
  const [input, setInput] = useState('');

  useEffect(() => {
    try {
      const raw = typeof window !== 'undefined' ? localStorage.getItem(HASHTAG_POOL_KEY) : null;
      if (raw) {
        const parsed = JSON.parse(raw) as string[];
        if (Array.isArray(parsed)) setPool(parsed);
      }
    } catch (_) { /* ignore */ }
  }, []);

  useEffect(() => {
    if (pool.length === 0) return;
    try {
      localStorage.setItem(HASHTAG_POOL_KEY, JSON.stringify(pool));
    } catch (_) { /* ignore */ }
  }, [pool]);

  const add = () => {
    const tag = normalizeHashtag(input);
    if (!tag || pool.includes(tag)) return;
    setPool((prev) => [...prev, tag].sort());
    setInput('');
  };

  const remove = (tag: string) => {
    setPool((prev) => prev.filter((t) => t !== tag));
  };

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-neutral-900 flex items-center gap-2">
          <Hash size={28} className="text-neutral-500" />
          Hashtag Pool
        </h1>
        <p className="mt-1 text-sm text-neutral-500">
          Add your favorite hashtags here. They will be available in the Composer when you create or schedule posts so you can pick up to 5 per post.
        </p>
      </div>

      <div className="card space-y-4">
        <label className="block text-sm font-medium text-neutral-700">Add a hashtag</label>
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), add())}
            placeholder="e.g. travel or #travel"
            className="flex-1 p-3 border border-neutral-200 rounded-xl text-neutral-900 placeholder:text-neutral-400 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
          />
          <button
            type="button"
            onClick={add}
            className="px-4 py-3 bg-indigo-600 text-white rounded-xl font-medium hover:bg-indigo-700 transition-colors inline-flex items-center gap-2"
          >
            <Plus size={20} />
            Add
          </button>
        </div>
        {pool.length > 0 ? (
          <div className="flex flex-wrap gap-2 pt-2">
            {pool.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center gap-1.5 pl-3 pr-1.5 py-1.5 bg-neutral-100 rounded-full text-sm text-neutral-800"
              >
                {tag}
                <button
                  type="button"
                  onClick={() => remove(tag)}
                  className="p-1 rounded-full hover:bg-neutral-200 text-neutral-500"
                  aria-label={`Remove ${tag}`}
                >
                  <X size={14} />
                </button>
              </span>
            ))}
          </div>
        ) : (
          <p className="text-sm text-neutral-500">No hashtags yet. Add some above to use them in the Composer.</p>
        )}
      </div>

      <p className="text-sm text-neutral-500">
        <Link href="/composer" className="text-indigo-600 hover:text-indigo-700 font-medium">
          Open Composer
        </Link>
        {' '}to create a post and choose hashtags from this pool (up to 5 per post).
      </p>
    </div>
  );
}
