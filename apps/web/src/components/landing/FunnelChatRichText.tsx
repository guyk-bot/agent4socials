'use client';

import React from 'react';

const URL_RE = /(https?:\/\/[^\s]+)/g;

/** Renders chat text with clickable URLs (new tab). */
export function FunnelChatRichText({ text }: { text: string }) {
  const parts = text.split(URL_RE);
  return (
    <>
      {parts.map((part, i) => {
        if (!part) return null;
        if (/^https?:\/\//.test(part)) {
          const href = part.replace(/[),.]+$/, '');
          const trailing = part.slice(href.length);
          return (
            <React.Fragment key={i}>
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-[#7C3AED] underline underline-offset-2 hover:text-[#A78BFA]"
              >
                {href}
              </a>
              {trailing}
            </React.Fragment>
          );
        }
        return <React.Fragment key={i}>{part}</React.Fragment>;
      })}
    </>
  );
}
