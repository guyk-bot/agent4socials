'use client';

import React from 'react';
import { MessageSquarePlus, Trash2 } from 'lucide-react';
import { BRAND_NAME } from '@/lib/site-brand-assets';
import {
  groupChatSessions,
  type AysopChatSessionSummary,
} from '@/lib/ai/aysop-chat-sessions';

type Props = {
  sessions: AysopChatSessionSummary[];
  activeId: string | null;
  loading?: boolean;
  onSelect: (id: string) => void;
  onNewChat: () => void;
  onDelete: (id: string) => void;
  side?: 'left' | 'right';
};

export default function AysopChatSidebar({
  sessions,
  activeId,
  loading,
  onSelect,
  onNewChat,
  onDelete,
  side = 'left',
}: Props) {
  const groups = groupChatSessions(sessions);
  const borderClass = side === 'right' ? 'border-l border-neutral-200' : 'border-r border-neutral-200';

  return (
    <aside className={`w-[260px] shrink-0 flex flex-col ${borderClass} bg-neutral-50/80 h-full`}>
      <div className="p-3 border-b border-neutral-200">
        <button
          type="button"
          onClick={onNewChat}
          className="w-full flex items-center justify-center gap-2 rounded-xl border border-neutral-200 bg-white px-3 py-2.5 text-sm font-medium text-neutral-800 hover:border-[var(--primary)] hover:text-[var(--primary)] transition-colors"
        >
          <MessageSquarePlus size={18} />
          New chat
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-4">
        {loading && sessions.length === 0 ? (
          <p className="text-xs text-neutral-400 px-2 py-4">Loading chats…</p>
        ) : null}
        {!loading && sessions.length === 0 ? (
          <p className="text-xs text-neutral-500 px-2 py-4 leading-relaxed">
            Your {BRAND_NAME} AI conversations appear here. Start a new chat to ask about analytics, content, or your brand.
          </p>
        ) : null}
        {groups.map((group) => (
          <div key={group.label}>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-neutral-400 px-2 mb-1.5">
              {group.label}
            </p>
            <ul className="space-y-0.5">
              {group.sessions.map((s) => {
                const active = s.id === activeId;
                return (
                  <li key={s.id} className="group relative">
                    <button
                      type="button"
                      onClick={() => onSelect(s.id)}
                      className={`w-full text-left rounded-lg px-2.5 py-2 pr-8 text-sm transition-colors ${
                        active
                          ? 'bg-white border border-neutral-200 shadow-sm text-neutral-900 font-medium'
                          : 'text-neutral-700 hover:bg-white/80'
                      }`}
                    >
                      <span className="block truncate">{s.title || 'New chat'}</span>
                      {s.preview ? (
                        <span className="block truncate text-[11px] text-neutral-400 mt-0.5">{s.preview}</span>
                      ) : null}
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDelete(s.id);
                      }}
                      className="absolute right-1 top-1/2 -translate-y-1/2 p-1 rounded-md text-neutral-400 opacity-0 group-hover:opacity-100 hover:text-red-600 hover:bg-red-50 transition-opacity"
                      aria-label="Delete chat"
                    >
                      <Trash2 size={14} />
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </aside>
  );
}
