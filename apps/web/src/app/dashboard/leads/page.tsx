'use client';

import React from 'react';
import { Users } from 'lucide-react';

/**
 * Leads: mine comments from connected accounts for buying intent, with a suggested
 * outreach message and a downloadable CSV. Full mining UI is built in a later phase.
 */
export default function LeadsPage() {
  return (
    <div className="mx-auto w-full max-w-5xl">
      <div className="mb-6 flex items-start gap-3">
        <div className="mt-0.5 rounded-xl bg-[var(--primary)]/10 p-2 text-[var(--primary)]">
          <Users size={20} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-[var(--foreground)]">Leads</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Find people who commented on your posts and look like potential customers, with a
            suggested outreach message and a downloadable spreadsheet.
          </p>
        </div>
      </div>
      <div className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--bg-surface)] p-8 text-center">
        <p className="text-sm text-[var(--muted)]">
          Lead mining is being set up. You will be able to scan synced comments for buying intent
          and export profile, comment, and outreach message to CSV.
        </p>
      </div>
    </div>
  );
}
