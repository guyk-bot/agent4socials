'use client';

import React from 'react';
import type { BrandContextRecord } from '@/lib/brand-context-utils';

type Props = {
  draft: BrandContextRecord;
  onChange: (next: BrandContextRecord) => void;
  onSave: () => void;
  disabled?: boolean;
  manualMode?: boolean;
  hashtagPool?: string;
  onHashtagPoolChange?: (value: string) => void;
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
    placeholder: 'Who are you trying to reach? (role, industry, interests)',
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
    rows: 3,
    placeholder: 'Example captions or phrases you would use…',
  },
  {
    key: 'inboxReplyExamples',
    label: 'Inbox reply examples',
    rows: 3,
    placeholder: 'Example DM replies you would send to customers…',
  },
  {
    key: 'commentReplyExamples',
    label: 'Comment reply examples',
    rows: 3,
    placeholder: 'Example comment replies you would post…',
  },
  {
    key: 'additionalContext',
    label: 'Additional context',
    rows: 2,
    placeholder: 'Brand values, key messages, or other notes for the AI…',
  },
];

export default function FunnelBrandContextCard({
  draft,
  onChange,
  onSave,
  disabled,
  manualMode,
  hashtagPool = '',
  onHashtagPoolChange,
}: Props) {
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
      <label className="block space-y-1">
        <span className="text-xs text-[var(--chat-hero-muted)]">Hashtag pool</span>
        <textarea
          value={hashtagPool}
          onChange={(e) => onHashtagPoolChange?.(e.target.value)}
          rows={2}
          disabled={disabled}
          placeholder="#socialmedia #creators #marketing (space-separated)"
          className="w-full rounded-lg border border-[var(--chat-hero-border)] bg-[var(--chat-hero-input-bg)] px-3 py-2 text-sm text-[var(--chat-hero-text)] outline-none focus:border-[#7C3AED]/50 placeholder:text-[var(--chat-hero-muted)]/70"
        />
      </label>
      <button
        type="button"
        disabled={disabled}
        onClick={onSave}
        className="btn-glass btn-glass-primary btn-glass-md"
      >
        Save brand context
      </button>
    </div>
  );
}
