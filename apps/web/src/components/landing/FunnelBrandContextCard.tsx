'use client';

import React from 'react';
import type { BrandContextRecord } from '@/lib/brand-context-utils';

type Props = {
  draft: BrandContextRecord;
  onChange: (next: BrandContextRecord) => void;
  onSave: () => void;
  disabled?: boolean;
  manualMode?: boolean;
};

const FIELDS: { key: keyof BrandContextRecord; label: string; rows: number; placeholder: string }[] = [
  {
    key: 'productDescription',
    label: 'What you offer',
    rows: 2,
    placeholder: 'Describe your product, service, or what you post about…',
  },
  {
    key: 'targetAudience',
    label: 'Target audience',
    rows: 2,
    placeholder: 'Who are you trying to reach? (age, interests, role, etc.)',
  },
  {
    key: 'toneOfVoice',
    label: 'Tone of voice',
    rows: 2,
    placeholder: 'Friendly, expert, playful, bold, etc.',
  },
  {
    key: 'toneExamples',
    label: 'Tone examples',
    rows: 2,
    placeholder: 'Paste example captions or phrases you would use…',
  },
  {
    key: 'additionalContext',
    label: 'Additional context',
    rows: 2,
    placeholder: 'Anything else iZop should know about your brand…',
  },
];

export default function FunnelBrandContextCard({ draft, onChange, onSave, disabled, manualMode }: Props) {
  return (
    <div className="rounded-xl border border-[var(--chat-hero-border)] bg-[var(--chat-hero-surface)] p-4 space-y-3 chat-hero-message-enter">
      <p className="text-sm font-medium text-[var(--chat-hero-text)]">Brand context (editable)</p>
      {FIELDS.map((field) => (
        <label key={field.key} className="block space-y-1">
          <span className="text-xs text-[var(--chat-hero-muted)]">{field.label}</span>
          <textarea
            value={String(draft[field.key] ?? '')}
            onChange={(e) => onChange({ ...draft, [field.key]: e.target.value })}
            rows={field.rows}
            disabled={disabled}
            placeholder={manualMode || !String(draft[field.key] ?? '').trim() ? field.placeholder : undefined}
            className="w-full rounded-lg border border-[var(--chat-hero-border)] bg-[var(--chat-hero-input-bg)] px-3 py-2 text-sm text-[var(--chat-hero-text)] outline-none focus:border-[#7C3AED]/50 placeholder:text-[var(--chat-hero-muted)]/70"
          />
        </label>
      ))}
      <button
        type="button"
        disabled={disabled}
        onClick={onSave}
        className="rounded-full bg-gradient-to-br from-[#7C3AED] to-[#4F46E5] px-5 py-2.5 text-sm font-medium text-white hover:brightness-110 disabled:opacity-50"
      >
        Save brand context
      </button>
    </div>
  );
}
