'use client';

import React from 'react';

type CellValue = 'check' | 'dash' | string;

type TableSection = {
  title: string;
  note?: string;
  rows: { feature: string; free: CellValue; starter: CellValue; pro: CellValue }[];
};

const SECTIONS: TableSection[] = [
  {
    title: 'Connections',
    rows: [
      { feature: 'Instagram connection', free: 'check', starter: 'check', pro: 'check' },
      { feature: 'Facebook connection', free: 'check', starter: 'check', pro: 'check' },
      { feature: 'TikTok connection', free: 'check', starter: 'check', pro: 'check' },
      { feature: 'YouTube connection', free: 'check', starter: 'check', pro: 'check' },
      { feature: 'X / Twitter connection', free: 'dash', starter: 'check', pro: 'check' },
      { feature: 'LinkedIn connection', free: 'dash', starter: 'check', pro: 'check' },
    ],
  },
  {
    title: 'Publishing',
    rows: [
      { feature: 'Post composer', free: 'check', starter: 'check', pro: 'check' },
      { feature: 'Schedule posts', free: 'check', starter: 'check', pro: 'check' },
      { feature: 'Scheduled posts', free: '50/month', starter: 'Unlimited', pro: 'Unlimited' },
      { feature: 'Draft posts', free: 'check', starter: 'check', pro: 'check' },
      { feature: 'Bulk scheduling', free: 'dash', starter: 'check', pro: 'check' },
    ],
  },
  {
    title: 'Inbox & Engagement',
    rows: [
      { feature: 'Unified inbox', free: 'check', starter: 'check', pro: 'check' },
      { feature: 'View messages and comments', free: 'check', starter: 'check', pro: 'check' },
      { feature: 'Reply to messages and comments', free: 'dash', starter: 'check', pro: 'check' },
      { feature: 'Bulk replies (messages and comments)', free: 'dash', starter: 'dash', pro: 'check' },
    ],
  },
  {
    title: 'Analytics',
    rows: [
      { feature: 'Basic analytics', free: 'check', starter: 'check', pro: 'check' },
      { feature: 'Analytics history', free: '30 days', starter: '6 months', pro: 'Unlimited' },
      { feature: 'Unlimited analytic history', free: 'dash', starter: 'dash', pro: 'check' },
      { feature: 'Export analytics reports (no watermark)', free: 'dash', starter: 'check', pro: 'check' },
      { feature: 'White-label reports', free: 'dash', starter: 'dash', pro: 'check' },
    ],
  },
  {
    title: 'Smart Links',
    rows: [
      { feature: 'Smart link pages', free: '1', starter: '3', pro: '10' },
      { feature: 'Link click analytics', free: 'check', starter: 'check', pro: 'check' },
      { feature: 'Custom domains', free: 'dash', starter: 'dash', pro: 'check' },
    ],
  },
  {
    title: 'AI Assistant',
    rows: [
      { feature: 'AI Assistant use', free: 'Limited', starter: 'Unlimited', pro: 'Unlimited' },
    ],
  },
  {
    title: 'Automation',
    rows: [
      { feature: 'Keyword triggers', free: 'dash', starter: 'dash', pro: 'check' },
    ],
  },
  {
    title: 'Workspace',
    rows: [
      { feature: 'Access to history', free: 'dash', starter: 'check', pro: 'check' },
      { feature: 'Team members', free: 'dash', starter: 'dash', pro: 'check' },
    ],
  },
  {
    title: 'Client Tools',
    rows: [
      { feature: 'Client dashboard', free: 'dash', starter: 'dash', pro: 'check' },
    ],
  },
  {
    title: 'Support',
    rows: [
      { feature: 'Help center', free: 'check', starter: 'check', pro: 'check' },
      { feature: 'Priority support', free: 'dash', starter: 'dash', pro: 'check' },
    ],
  },
  {
    title: 'Brands',
    rows: [
      { feature: 'Brands included', free: '1', starter: '1', pro: '1' },
      { feature: 'Additional brands', free: '—', starter: '+$5/mo or $48/year', pro: '+$3/mo or $29/year' },
    ],
  },
];

function Cell({ value }: { value: CellValue }) {
  if (value === 'check') {
    return <span className="text-emerald-600 font-semibold" aria-hidden>✓</span>;
  }
  if (value === 'dash') {
    return <span className="text-neutral-300">—</span>;
  }
  return <span className="text-neutral-700 text-sm">{value}</span>;
}

export default function PricingComparisonTable() {
  return (
    <section className="py-16 sm:py-20">
      <div className="mx-auto max-w-5xl px-4 sm:px-6">
        <h2 className="text-center text-2xl font-bold text-neutral-900 sm:text-3xl">
          Compare plans
        </h2>
        <div className="mt-10 overflow-x-auto rounded-2xl border border-neutral-200 bg-white shadow-sm">
          <table className="w-full min-w-[640px] border-collapse text-left">
            <thead>
              <tr className="border-b border-neutral-200 bg-neutral-50/80">
                <th className="py-4 pl-6 pr-4 text-sm font-semibold text-neutral-900">Feature</th>
                <th className="py-4 px-4 text-sm font-semibold text-neutral-900 text-center">Free</th>
                <th className="py-4 px-4 text-sm font-semibold text-neutral-900 text-center">Starter</th>
                <th className="py-4 px-4 text-sm font-semibold text-neutral-900 text-center">Pro</th>
              </tr>
            </thead>
            <tbody>
              {SECTIONS.map((section) => (
                <React.Fragment key={section.title}>
                  <tr className="border-b border-neutral-100 bg-neutral-50/50">
                    <td colSpan={4} className="py-3 pl-6 pr-4 text-sm font-semibold uppercase tracking-wider text-neutral-600">
                      {section.title}
                    </td>
                  </tr>
                  {section.rows.map((row) => (
                    <tr key={row.feature} className="border-b border-neutral-100 hover:bg-neutral-50/50 transition-colors">
                      <td className="py-3 pl-6 pr-4 text-sm text-neutral-800">{row.feature}</td>
                      <td className="py-3 px-4 text-center"><Cell value={row.free} /></td>
                      <td className="py-3 px-4 text-center"><Cell value={row.starter} /></td>
                      <td className="py-3 px-4 text-center"><Cell value={row.pro} /></td>
                    </tr>
                  ))}
                  {section.note && (
                    <tr className="border-b border-neutral-100 bg-amber-50/30">
                      <td colSpan={4} className="py-2 pl-6 pr-4 text-xs text-amber-800/90">
                        {section.note}
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
