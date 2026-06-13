'use client';

import React from 'react';
import { FileText } from 'lucide-react';
import type { AysopChatAttachment } from '@/lib/ai/aysop-attachments';
import { AysopChatVideoPreview } from '@/components/aysop/AysopChatVideoPreview';

type Props = {
  attachments: AysopChatAttachment[];
  variant?: 'user' | 'assistant';
  /** User media shown outside the purple bubble (plain image, text in bubble below). */
  detached?: boolean;
};

export function AysopMessageAttachments({ attachments, variant = 'user', detached = false }: Props) {
  if (!attachments.length) return null;

  const onDark = variant === 'user' && !detached;

  return (
    <div className="space-y-2">
      {attachments.map((att) => {
        if (att.kind === 'image') {
          return (
            <a
              key={att.fileUrl}
              href={att.fileUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="block"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={att.fileUrl}
                alt={att.fileName}
                className={
                  detached
                    ? 'max-w-full max-h-48 rounded-lg object-contain'
                    : `max-w-full max-h-48 rounded-lg object-contain ${
                        variant === 'user'
                          ? 'bg-white/10 border border-white/20'
                          : 'bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700'
                      }`
                }
                style={{ display: 'block' }}
              />
            </a>
          );
        }
        if (att.kind === 'video') {
          return (
            <AysopChatVideoPreview
              key={att.fileUrl}
              src={att.fileUrl}
              fileName={att.fileName}
              onDarkBubble={onDark}
            />
          );
        }
        return (
          <a
            key={att.fileUrl}
            href={att.fileUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs ${
              onDark
                ? 'bg-white/15 hover:bg-white/25'
                : 'bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-700'
            }`}
          >
            <FileText size={14} className="shrink-0" />
            <span className="truncate">{att.fileName}</span>
          </a>
        );
      })}
    </div>
  );
}

type PendingProps = {
  attachments: AysopChatAttachment[];
  onRemove: (index: number) => void;
  uploading?: boolean;
};

export function AysopPendingAttachments({ attachments, onRemove, uploading }: PendingProps) {
  if (!attachments.length) return null;

  return (
    <div className="px-3 pt-2 flex flex-wrap gap-2 border-t border-neutral-100 dark:border-neutral-800 bg-neutral-50/80 dark:bg-neutral-950">
      {attachments.map((att, i) => (
        <div
          key={`${att.fileUrl}-${i}`}
          className={`relative group flex items-center gap-2 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-2 py-1.5 text-xs ${
            att.kind === 'video' ? 'max-w-none' : 'max-w-[240px]'
          }`}
        >
          {att.kind === 'image' ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={att.fileUrl} alt="" className="h-12 w-12 rounded object-cover shrink-0" />
          ) : att.kind === 'video' ? (
            <AysopChatVideoPreview src={att.fileUrl} fileName={att.fileName} compact />
          ) : (
            <FileText size={16} className="text-neutral-500 dark:text-neutral-400 shrink-0" />
          )}
          <span className="truncate text-neutral-700 dark:text-neutral-200 min-w-0">{att.fileName}</span>
          {!uploading ? (
            <button
              type="button"
              onClick={() => onRemove(i)}
              className="ml-auto shrink-0 text-neutral-400 dark:text-neutral-500 hover:text-red-600 dark:hover:text-red-400"
              aria-label={`Remove ${att.fileName}`}
            >
              ×
            </button>
          ) : null}
        </div>
      ))}
    </div>
  );
}
