'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Brain, MessageSquarePlus, MoreHorizontal } from 'lucide-react';
import { BRAND_NAME } from '@/lib/site-brand-assets';

type Props = {
  onNewChat: () => void;
  onOpenBrandContext: () => void;
  onOpenSettings: () => void;
  onClearHistory: () => void;
};

export default function AysopChatHeader({
  onNewChat,
  onOpenBrandContext,
  onOpenSettings,
  onClearHistory,
}: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onDocClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [menuOpen]);

  const runMenuAction = (action: () => void) => {
    setMenuOpen(false);
    action();
  };

  return (
    <header className="flex shrink-0 items-center justify-between gap-3 border-b border-neutral-200 dark:border-neutral-800 bg-[var(--dark)] text-chrome-text px-4 py-2.5">
      <div className="flex min-w-0 items-center gap-2">
        <Brain size={20} className="shrink-0 text-[#53BEFA]" />
        <h1 className="truncate text-sm font-semibold">{BRAND_NAME} AI</h1>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <div className="relative" ref={menuRef}>
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            className="rounded-lg p-2 text-chrome-text/70 hover:bg-white/10 hover:text-chrome-text transition-colors"
            aria-label="Chat options"
            aria-expanded={menuOpen}
            aria-haspopup="menu"
          >
            <MoreHorizontal size={20} />
          </button>
          {menuOpen ? (
            <div
              role="menu"
              className="absolute right-0 top-full z-50 mt-1 w-48 overflow-hidden rounded-xl border border-neutral-700 bg-neutral-900 py-1 shadow-xl"
            >
              <button
                type="button"
                role="menuitem"
                onClick={() => runMenuAction(onOpenBrandContext)}
                className="w-full px-3 py-2.5 text-left text-sm text-chrome-text hover:bg-white/10 transition-colors"
              >
                Brand Context
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => runMenuAction(onOpenSettings)}
                className="w-full px-3 py-2.5 text-left text-sm text-neutral-400 hover:bg-white/10 hover:text-chrome-text transition-colors"
                title="Coming soon"
              >
                Settings
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => runMenuAction(onClearHistory)}
                className="w-full px-3 py-2.5 text-left text-sm text-red-400 hover:bg-red-950/40 transition-colors"
              >
                Clear history
              </button>
            </div>
          ) : null}
        </div>

        <button
          type="button"
          onClick={onNewChat}
          className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/10 px-3 py-2 text-sm font-medium text-chrome-text hover:bg-white/15 transition-colors"
        >
          <MessageSquarePlus size={18} />
          <span className="hidden sm:inline">New chat</span>
        </button>
      </div>
    </header>
  );
}
