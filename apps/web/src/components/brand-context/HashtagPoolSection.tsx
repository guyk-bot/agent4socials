'use client';

import React, { useEffect, useState } from 'react';
import { Hash, Plus, X } from 'lucide-react';
import { normalizeHashtag, readHashtagPool, writeHashtagPool } from '@/lib/hashtag-pool';

type Props = {
  variant?: 'page' | 'drawer' | 'full';
};

function isDarkVariant(variant: 'page' | 'drawer' | 'full') {
  return variant === 'drawer' || variant === 'full';
}

function sectionClass(variant: 'page' | 'drawer' | 'full') {
  return isDarkVariant(variant)
    ? 'rounded-xl border border-neutral-800 bg-neutral-900/60 p-4 sm:p-5'
    : 'card p-6';
}

function headingClass(variant: 'page' | 'drawer' | 'full') {
  return isDarkVariant(variant) ? 'font-semibold text-neutral-100' : 'font-semibold text-gray-900';
}

function bodyTextClass(variant: 'page' | 'drawer' | 'full') {
  return isDarkVariant(variant) ? 'text-sm text-neutral-400' : 'text-sm text-gray-500';
}

function labelClass(variant: 'page' | 'drawer' | 'full') {
  return isDarkVariant(variant) ? 'text-sm font-medium text-neutral-200' : 'text-sm font-medium text-neutral-700';
}

function inputClass(variant: 'page' | 'drawer' | 'full') {
  return isDarkVariant(variant)
    ? 'flex-1 p-3 border border-neutral-700 rounded-xl text-sm text-neutral-100 placeholder:text-neutral-500 bg-neutral-900 focus:ring-2 focus:ring-[var(--primary)]/30 focus:border-[var(--primary)] focus:outline-none'
    : 'flex-1 p-3 border border-neutral-200 rounded-xl text-neutral-900 placeholder:text-neutral-400 focus:ring-2 focus:ring-[var(--button)]/30 focus:border-[var(--button)]';
}

function tagClass(variant: 'page' | 'drawer' | 'full') {
  return isDarkVariant(variant)
    ? 'inline-flex items-center gap-1.5 pl-3 pr-1.5 py-1.5 bg-neutral-800 rounded-full text-sm text-neutral-100'
    : 'inline-flex items-center gap-1.5 pl-3 pr-1.5 py-1.5 bg-neutral-100 rounded-full text-sm text-neutral-800';
}

function tagRemoveClass(variant: 'page' | 'drawer' | 'full') {
  return isDarkVariant(variant)
    ? 'p-1 rounded-full hover:bg-neutral-700 text-neutral-400'
    : 'p-1 rounded-full hover:bg-neutral-200 text-neutral-500';
}

export default function HashtagPoolSection({ variant = 'page' }: Props) {
  const [pool, setPool] = useState<string[]>([]);
  const [input, setInput] = useState('');
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setPool(readHashtagPool());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    writeHashtagPool(pool);
  }, [pool, hydrated]);

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
    <div className={sectionClass(variant)}>
      <div className="flex items-start gap-3 mb-4">
        <Hash size={22} className="text-[var(--button)] shrink-0 mt-0.5" />
        <div>
          <h2 className={headingClass(variant)}>Hashtag pool</h2>
          <p className={`${bodyTextClass(variant)} mt-0.5`}>
            Save your favorite hashtags here. They are available in the Composer when you create or schedule posts (up to
            5 per post).
          </p>
        </div>
      </div>

      <label className={`block ${labelClass(variant)} mb-2`}>Add a hashtag</label>
      <div className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), add())}
          placeholder="e.g. travel or #travel"
          className={inputClass(variant)}
        />
        <button
          type="button"
          onClick={add}
          className="px-4 py-3 bg-[var(--button)] text-chrome-text rounded-xl font-medium hover:bg-[var(--button-hover)] transition-colors inline-flex items-center gap-2 shrink-0"
        >
          <Plus size={20} />
          Add
        </button>
      </div>

      {pool.length > 0 ? (
        <div className="flex flex-wrap gap-2 pt-4">
          {pool.map((tag) => (
            <span key={tag} className={tagClass(variant)}>
              {tag}
              <button
                type="button"
                onClick={() => remove(tag)}
                className={tagRemoveClass(variant)}
                aria-label={`Remove ${tag}`}
              >
                <X size={14} />
              </button>
            </span>
          ))}
        </div>
      ) : (
        <p className={`${bodyTextClass(variant)} pt-4`}>
          No hashtags yet. Add some above to use them in the Composer.
        </p>
      )}
    </div>
  );
}
