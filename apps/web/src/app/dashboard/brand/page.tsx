'use client';

import React from 'react';
import BrandContextForm from '@/components/brand-context/BrandContextForm';

/**
 * Brand settings (brand context) as a top-level workspace page.
 * Moved out of iZop AI into the left sidebar so it is reachable from anywhere.
 */
export default function BrandPage() {
  return (
    <div className="mx-auto w-full max-w-4xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[var(--foreground)]">Brand</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Tell iZop about your product, audience, and voice. This context powers AI captions,
          replies, and outreach across the app.
        </p>
      </div>
      <BrandContextForm variant="page" />
    </div>
  );
}
