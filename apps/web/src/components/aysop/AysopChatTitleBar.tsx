'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Pencil } from 'lucide-react';

type Props = {
  title: string;
  disabled?: boolean;
  onRename: (title: string) => void | Promise<void>;
};

export default function AysopChatTitleBar({ title, disabled, onRename }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(title);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!editing) setDraft(title);
  }, [title, editing]);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  const save = () => {
    const trimmed = draft.trim();
    if (!trimmed) {
      setDraft(title);
      setEditing(false);
      return;
    }
    if (trimmed !== title) onRename(trimmed);
    setEditing(false);
  };

  return (
    <div className="shrink-0 border-b border-neutral-100 dark:border-neutral-800 px-4 py-2.5 bg-white dark:bg-neutral-950 flex items-center gap-2 min-h-[44px]">
      {editing ? (
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => save()}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              save();
            }
            if (e.key === 'Escape') {
              setDraft(title);
              setEditing(false);
            }
          }}
          maxLength={120}
          disabled={disabled}
          className="flex-1 min-w-0 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-sm text-neutral-900 dark:text-neutral-100 px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/40"
          placeholder="Chat name"
        />
      ) : (
        <>
          <p className="flex-1 min-w-0 text-sm font-medium text-neutral-800 dark:text-neutral-100 truncate">
            {title || 'New chat'}
          </p>
          <button
            type="button"
            onClick={() => setEditing(true)}
            disabled={disabled}
            className="shrink-0 p-1.5 rounded-md text-neutral-400 dark:text-neutral-500 hover:text-[var(--primary)] hover:bg-neutral-100 dark:hover:bg-neutral-900 disabled:opacity-40"
            aria-label="Rename chat"
            title="Rename chat"
          >
            <Pencil size={14} />
          </button>
        </>
      )}
    </div>
  );
}
