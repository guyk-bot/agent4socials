'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { satoshi } from '@/lib/fonts/satoshi';
import {
  FONT_PREVIEW_CATALOG,
  FONT_PREVIEW_GROUPS,
  SATOSHI_PREVIEW_ENTRY,
  googleFontsStylesheetUrls,
  type FontPreviewEntry,
} from '@/lib/fonts/font-preview-catalog';

const GREETING = "Hi 👋 I'm iZop,";
const HEADLINE = 'your personal AI social media manager.';
const BODY = "Tell me what platforms you're on, and I'll show you what I can do.";

function SampleBlock({ family }: { family: string }) {
  return (
    <div style={{ fontFamily: family }}>
      <p className="text-2xl sm:text-3xl text-neutral-900">{GREETING}</p>
      <p className="mt-1 text-lg sm:text-xl text-neutral-700">{HEADLINE}</p>
      <p className="mt-2 text-sm text-neutral-500">{BODY}</p>
    </div>
  );
}

function SatoshiWeights() {
  const weights = [
    { label: 'Regular 400', className: 'font-normal' },
    { label: 'Medium 500', className: 'font-medium' },
    { label: 'Bold 700', className: 'font-bold' },
    { label: 'Black 900', className: 'font-black' },
  ];
  return (
    <div className="space-y-4">
      {weights.map((w) => (
        <div key={w.label} className={`${satoshi.className} ${w.className}`}>
          <p className="text-[10px] uppercase tracking-wide text-neutral-400 mb-1">{w.label}</p>
          <p className="text-2xl sm:text-3xl text-neutral-900">{GREETING}</p>
          <p className="mt-1 text-lg sm:text-xl text-neutral-700">{HEADLINE}</p>
          <p className="mt-2 text-sm text-neutral-500">{BODY}</p>
        </div>
      ))}
    </div>
  );
}

function FontSection({ entry }: { entry: FontPreviewEntry | typeof SATOSHI_PREVIEW_ENTRY }) {
  const isSatoshi = entry.id === 'satoshi';

  return (
    <section className="rounded-2xl border border-[#E8E6DF] bg-white p-5 sm:p-6 shadow-sm">
      <div className="mb-4 flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-neutral-100 pb-3">
        <h2 className="text-base font-semibold text-neutral-900">{entry.label}</h2>
        {entry.note ? <span className="text-xs text-neutral-500">{entry.note}</span> : null}
      </div>
      {isSatoshi ? <SatoshiWeights /> : <SampleBlock family={(entry as FontPreviewEntry).family} />}
    </section>
  );
}

export function FontPreviewCatalog() {
  useEffect(() => {
    const urls = googleFontsStylesheetUrls(FONT_PREVIEW_CATALOG);
    const links: HTMLLinkElement[] = [];
    for (const href of urls) {
      if (document.querySelector(`link[data-font-preview="${href}"]`)) continue;
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = href;
      link.setAttribute('data-font-preview', href);
      document.head.appendChild(link);
      links.push(link);
    }
    return () => {
      for (const link of links) link.remove();
    };
  }, []);

  const totalCount = FONT_PREVIEW_CATALOG.length + 1;

  return (
    <div className="min-h-screen bg-[#F8F7FC] text-neutral-900">
      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
        <div className="mb-10 rounded-2xl border border-[#E8E6DF] bg-white p-6 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-[#7C3AED]">Temporary</p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight">Funnel chat font preview</h1>
          <p className="mt-2 text-sm text-neutral-600">
            Same copy as the landing chat hero. {totalCount} fonts to compare: what iZop uses today, Smart Links
            options, and extra popular web fonts you can choose from.
          </p>
          <Link href="/" className="mt-4 inline-flex text-sm font-medium text-[#7C3AED] hover:underline">
            Back to funnel
          </Link>
        </div>

        {FONT_PREVIEW_GROUPS.map((group) => {
          const entries =
            group.id === 'app'
              ? [SATOSHI_PREVIEW_ENTRY, ...FONT_PREVIEW_CATALOG.filter((f) => f.group === 'app')]
              : FONT_PREVIEW_CATALOG.filter((f) => f.group === group.id);
          if (entries.length === 0) return null;

          return (
            <div key={group.id} className="mb-10">
              <div className="mb-4">
                <h2 className="text-lg font-semibold text-neutral-900">{group.title}</h2>
                <p className="text-sm text-neutral-500">{group.description}</p>
              </div>
              <div className="space-y-6">
                {entries.map((entry) => (
                  <FontSection key={entry.id} entry={entry} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
