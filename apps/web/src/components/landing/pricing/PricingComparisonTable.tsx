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
      { feature: 'X (Twitter) connection', free: 'check', starter: 'check', pro: 'check' },
      { feature: 'LinkedIn connection', free: 'dash', starter: 'check', pro: 'check' },
    ],
  },
  {
    title: 'Publishing',
    rows: [
      { feature: 'Post composer', free: 'check', starter: 'check', pro: 'check' },
      { feature: 'Schedule posts', free: 'check', starter: 'check', pro: 'check' },
      { feature: 'Scheduled posts', free: '25/month', starter: 'Unlimited', pro: 'Unlimited' },
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
      { feature: 'White label', free: 'dash', starter: 'dash', pro: 'check' },
    ],
  },
  {
    title: 'Smart Links',
    rows: [
      { feature: 'Smart link pages', free: '1', starter: '3', pro: '10' },
      { feature: 'Link click analytics', free: 'check', starter: 'check', pro: 'check' },
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
      { feature: 'Add team members', free: 'dash', starter: 'dash', pro: 'check' },
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
    return <span className="text-[#2f9e44] font-semibold" aria-hidden>✓</span>;
  }
  if (value === 'dash') {
    return <span className="text-[#c7b7d8]">—</span>;
  }
  return <span className="text-[#5d5768] text-sm">{value}</span>;
}

function CellDark({ value }: { value: CellValue }) {
  if (value === 'check') {
    return <span className="text-[#2f9e44]">✓</span>;
  }
  if (value === 'dash') {
    return <span className="text-[#c7b7d8]">—</span>;
  }
  return <span className="text-[#5d5768] text-sm">{value}</span>;
}

export default function PricingComparisonTable({ dark }: { dark?: boolean }) {
  const CellComponent = dark ? CellDark : Cell;
  void dark;
  return (
    <section className="py-16 sm:py-20 border-t border-[#efe7f7]">
      <div className="mx-auto max-w-5xl px-4 sm:px-6">
        <h2 className="text-center text-2xl font-bold text-[#1a161f] sm:text-3xl">
          Compare plans
        </h2>
        <div className="mt-10 overflow-x-auto rounded-2xl border border-[#efe7f7] bg-white shadow-sm">
          <table className="w-full min-w-[640px] border-collapse text-left">
            <thead>
              <tr className="border-b border-[#efe7f7] bg-[#fbf8ff]">
                <th className="py-4 pl-6 pr-4 text-sm font-semibold text-[#1a161f]">Feature</th>
                <th className="py-4 px-4 text-sm font-semibold text-[#1a161f] text-center">Free</th>
                <th className="py-4 px-4 text-sm font-semibold text-[#1a161f] text-center">Starter</th>
                <th className="py-4 px-4 text-sm font-semibold text-[#1a161f] text-center">Pro</th>
              </tr>
            </thead>
            <tbody>
              {SECTIONS.map((section) => (
                <React.Fragment key={section.title}>
                  <tr className="border-b border-[#f5eefb] bg-[#fcfaff]">
                    <td colSpan={4} className="py-3 pl-6 pr-4 text-sm font-semibold uppercase tracking-wider text-[#8f7ca9]">
                      {section.title}
                    </td>
                  </tr>
                  {section.rows.map((row) => (
                    <tr key={row.feature} className="border-b border-[#f7f2fc] hover:bg-[#fbf7ff] transition-colors">
                      <td className="py-3 pl-6 pr-4 text-sm text-[#473f55]">{row.feature}</td>
                      <td className="py-3 px-4 text-center"><Cell value={row.free} /></td>
                      <td className="py-3 px-4 text-center"><Cell value={row.starter} /></td>
                      <td className="py-3 px-4 text-center"><Cell value={row.pro} /></td>
                    </tr>
                  ))}
                  {section.note && (
                    <tr className="border-b border-[#f0d8de] bg-[#fff5f7]">
                      <td colSpan={4} className="py-2 pl-6 pr-4 text-xs text-[#c44536]">
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
