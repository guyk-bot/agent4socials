'use client';

import React, { useMemo } from 'react';
import Link from 'next/link';
import { ExternalLink } from 'lucide-react';
import { normalizeInAppChatHref } from '@/lib/app-base-url';

const URL_RE = /https?:\/\/[^\s<>[\]()]+/g;
const MD_IMAGE_RE = /^!\[([^\]]*)\]\((https?:\/\/[^\s)]+)\)/;
const RELATIVE_APP_PATH_RE = /^(\/(?:composer|dashboard|calendar|posts|connect|help|signup|login)(?:\/[^\s]*)?)/;

type Segment =
  | { kind: 'text'; value: string }
  | { kind: 'link'; href: string; label: string; internal?: boolean }
  | { kind: 'image-link'; href: string; alt: string; internal?: boolean };

function trimTrailingUrlPunctuation(url: string): string {
  return url.replace(/[.,;:!?)]+$/, '');
}

function resolveHref(rawHref: string): { href: string; label: string; internal: boolean } {
  const origin = typeof window !== 'undefined' ? window.location.origin : undefined;
  const internal = normalizeInAppChatHref(rawHref, origin);
  if (internal) {
    return { href: internal, label: internal, internal: true };
  }
  return { href: rawHref, label: rawHref, internal: false };
}

function parseChatContent(content: string): Segment[] {
  const segments: Segment[] = [];
  let i = 0;

  while (i < content.length) {
    const rest = content.slice(i);
    const mdMatch = rest.match(MD_IMAGE_RE);
    if (mdMatch) {
      const href = mdMatch[2]!;
      const resolved = resolveHref(href);
      segments.push({
        kind: 'image-link',
        href: resolved.href,
        alt: mdMatch[1] || 'Open post',
        internal: resolved.internal,
      });
      i += mdMatch[0]!.length;
      continue;
    }

    const relMatch = rest.match(RELATIVE_APP_PATH_RE);
    if (relMatch && relMatch.index === 0) {
      const href = trimTrailingUrlPunctuation(relMatch[1]!);
      segments.push({ kind: 'link', href, label: href, internal: true });
      i += relMatch[0]!.length;
      continue;
    }

    URL_RE.lastIndex = 0;
    const urlMatch = URL_RE.exec(rest);
    if (urlMatch && urlMatch.index === 0) {
      const raw = trimTrailingUrlPunctuation(urlMatch[0]!);
      const resolved = resolveHref(raw);
      segments.push({ kind: 'link', href: resolved.href, label: resolved.label, internal: resolved.internal });
      i += urlMatch[0]!.length;
      continue;
    }

    const nextMd = rest.indexOf('![', 1);
    const nextRel = rest.search(RELATIVE_APP_PATH_RE);
    URL_RE.lastIndex = 0;
    let nextUrl = -1;
    const urlLater = URL_RE.exec(rest);
    if (urlLater && typeof urlLater.index === 'number' && urlLater.index > 0) {
      nextUrl = urlLater.index;
    }

    const candidates = [nextMd, nextRel, nextUrl].filter((n) => n >= 0);
    const nextSpecial = candidates.length ? Math.min(...candidates) : -1;

    if (nextSpecial < 0) {
      segments.push({ kind: 'text', value: rest });
      break;
    }

    segments.push({ kind: 'text', value: rest.slice(0, nextSpecial) });
    i += nextSpecial;
  }

  return segments;
}

function linkClassName(variant: 'user' | 'assistant'): string {
  if (variant === 'user') {
    return 'underline underline-offset-2 decoration-white/70 hover:decoration-white break-all';
  }
  return 'text-[var(--primary)] underline underline-offset-2 hover:opacity-90 break-all';
}

function ChatLink({
  href,
  label,
  internal,
  className,
}: {
  href: string;
  label: string;
  internal: boolean;
  className: string;
}) {
  if (internal) {
    return (
      <Link href={href} className={className}>
        {label}
      </Link>
    );
  }
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={className}>
      {label}
    </a>
  );
}

export function AysopChatMessageContent({
  content,
  variant,
}: {
  content: string;
  variant: 'user' | 'assistant';
}) {
  const segments = useMemo(() => parseChatContent(content), [content]);
  const linkClass = linkClassName(variant);

  return (
    <>
      {segments.map((seg, i) => {
        if (seg.kind === 'text') {
          return <React.Fragment key={i}>{seg.value}</React.Fragment>;
        }
        if (seg.kind === 'image-link') {
          return (
            <span key={i} className="inline-flex items-center gap-1">
              <ChatLink
                href={seg.href}
                label={seg.alt || 'Open post'}
                internal={seg.internal ?? false}
                className={`inline-flex items-center gap-1 ${linkClass}`}
              />
              {!seg.internal ? <ExternalLink size={12} className="shrink-0 opacity-80" aria-hidden /> : null}
            </span>
          );
        }
        return (
          <span key={i} className="inline-flex items-center gap-1">
            <ChatLink href={seg.href} label={seg.label} internal={seg.internal ?? false} className={linkClass} />
            {!seg.internal ? <ExternalLink size={12} className="shrink-0 opacity-80" aria-hidden /> : null}
          </span>
        );
      })}
    </>
  );
}
