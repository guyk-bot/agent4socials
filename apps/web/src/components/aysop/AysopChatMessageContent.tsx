'use client';

import React, { useMemo } from 'react';
import { ExternalLink } from 'lucide-react';

const URL_RE = /https?:\/\/[^\s<>[\]()]+/g;
const MD_IMAGE_RE = /^!\[([^\]]*)\]\((https?:\/\/[^\s)]+)\)/;

type Segment =
  | { kind: 'text'; value: string }
  | { kind: 'link'; href: string; label: string }
  | { kind: 'image-link'; href: string; alt: string };

function trimTrailingUrlPunctuation(url: string): string {
  return url.replace(/[.,;:!?)]+$/, '');
}

function parseChatContent(content: string): Segment[] {
  const segments: Segment[] = [];
  let i = 0;

  while (i < content.length) {
    const rest = content.slice(i);
    const mdMatch = rest.match(MD_IMAGE_RE);
    if (mdMatch) {
      segments.push({ kind: 'image-link', href: mdMatch[2]!, alt: mdMatch[1] || 'Open post' });
      i += mdMatch[0]!.length;
      continue;
    }

    URL_RE.lastIndex = 0;
    const urlMatch = URL_RE.exec(rest);
    if (urlMatch && urlMatch.index === 0) {
      const href = trimTrailingUrlPunctuation(urlMatch[0]!);
      segments.push({ kind: 'link', href, label: href });
      i += urlMatch[0]!.length;
      continue;
    }

    const nextMd = rest.indexOf('![', 1);
    URL_RE.lastIndex = 0;
    let nextUrl = -1;
    const urlLater = URL_RE.exec(rest);
    if (urlLater && typeof urlLater.index === 'number' && urlLater.index > 0) {
      nextUrl = urlLater.index;
    }

    let nextSpecial = -1;
    if (nextMd >= 0 && nextUrl >= 0) nextSpecial = Math.min(nextMd, nextUrl);
    else nextSpecial = Math.max(nextMd, nextUrl);

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
            <a
              key={i}
              href={seg.href}
              target="_blank"
              rel="noopener noreferrer"
              className={`inline-flex items-center gap-1 ${linkClass}`}
            >
              {seg.alt || 'Open post'}
              <ExternalLink size={12} className="shrink-0 opacity-80" aria-hidden />
            </a>
          );
        }
        return (
          <a
            key={i}
            href={seg.href}
            target="_blank"
            rel="noopener noreferrer"
            className={linkClass}
          >
            {seg.label}
          </a>
        );
      })}
    </>
  );
}
