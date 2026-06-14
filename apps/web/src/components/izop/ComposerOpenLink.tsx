'use client';

import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ExternalLink } from 'lucide-react';
import {
  stageIzopComposerDraft,
  type IzopComposerDraftPayload,
} from '@/lib/composer/izop-composer-draft-bridge';

type Props = {
  href: string;
  label?: string;
  draft?: IzopComposerDraftPayload | null;
  className?: string;
};

export function ComposerOpenLink({ href, label, draft, className }: Props) {
  const router = useRouter();
  const mergedClass =
    className ??
    'inline-flex items-center gap-1.5 text-sm font-medium text-[var(--primary)] hover:underline mt-2';

  if (!draft) {
    return (
      <Link href={href} className={mergedClass}>
        {label ?? 'Open Composer'} <ExternalLink size={14} />
      </Link>
    );
  }

  return (
    <Link
      href={href}
      className={mergedClass}
      onClick={(e) => {
        e.preventDefault();
        stageIzopComposerDraft(draft);
        router.push(href);
      }}
    >
      {label ?? 'Open Composer'} <ExternalLink size={14} />
    </Link>
  );
}
