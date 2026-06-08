'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Lightbulb, Plus, Sparkles, Trash2, Loader2, X } from 'lucide-react';
import api from '@/lib/api';
import { useAuth } from '@/context/AuthContext';

type Idea = { id: string; text: string };
type Section = { id: string; title: string; items: Idea[] };

const DEFAULT_SECTIONS: Section[] = [
  { id: 'ideas', title: 'Ideas', items: [] },
  { id: 'hooks', title: 'Hooks', items: [] },
  { id: 'pillars', title: 'Content pillars', items: [] },
  { id: 'campaigns', title: 'Campaigns', items: [] },
];

function storageKey(userId?: string | null) {
  return `izop:brainstorm:${userId ?? 'anon'}`;
}

function newId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function readSections(userId?: string | null): Section[] {
  if (typeof window === 'undefined') return DEFAULT_SECTIONS;
  try {
    const raw = window.localStorage.getItem(storageKey(userId));
    if (!raw) return DEFAULT_SECTIONS;
    const parsed = JSON.parse(raw) as Section[];
    if (Array.isArray(parsed) && parsed.length) return parsed;
  } catch {
    /* ignore */
  }
  return DEFAULT_SECTIONS;
}

export default function BrainstormPage() {
  const { user } = useAuth();
  const [sections, setSections] = useState<Section[]>(DEFAULT_SECTIONS);
  const [hydrated, setHydrated] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [aiLoading, setAiLoading] = useState<Record<string, boolean>>({});
  const [aiError, setAiError] = useState<string | null>(null);
  const [addingSection, setAddingSection] = useState(false);
  const [newSectionTitle, setNewSectionTitle] = useState('');
  const persistTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setSections(readSections(user?.id));
    setHydrated(true);
  }, [user?.id]);

  useEffect(() => {
    if (!hydrated) return;
    if (persistTimer.current) clearTimeout(persistTimer.current);
    persistTimer.current = setTimeout(() => {
      try {
        window.localStorage.setItem(storageKey(user?.id), JSON.stringify(sections));
      } catch {
        /* ignore quota */
      }
    }, 300);
    return () => {
      if (persistTimer.current) clearTimeout(persistTimer.current);
    };
  }, [sections, hydrated, user?.id]);

  const addItem = useCallback((sectionId: string, text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setSections((prev) =>
      prev.map((s) =>
        s.id === sectionId ? { ...s, items: [...s.items, { id: newId(), text: trimmed }] } : s
      )
    );
    setDrafts((prev) => ({ ...prev, [sectionId]: '' }));
  }, []);

  const removeItem = useCallback((sectionId: string, itemId: string) => {
    setSections((prev) =>
      prev.map((s) =>
        s.id === sectionId ? { ...s, items: s.items.filter((i) => i.id !== itemId) } : s
      )
    );
  }, []);

  const removeSection = useCallback((sectionId: string) => {
    setSections((prev) => prev.filter((s) => s.id !== sectionId));
  }, []);

  const addSection = useCallback(() => {
    const title = newSectionTitle.trim();
    if (!title) return;
    setSections((prev) => [...prev, { id: newId(), title, items: [] }]);
    setNewSectionTitle('');
    setAddingSection(false);
  }, [newSectionTitle]);

  const generateWithAi = useCallback(
    async (section: Section) => {
      setAiError(null);
      setAiLoading((prev) => ({ ...prev, [section.id]: true }));
      try {
        const res = await api.post<{ ideas: string[] }>('/ai/brainstorm-ideas', {
          section: section.title,
          count: 5,
          existing: section.items.map((i) => i.text),
        });
        const ideas = (res.data.ideas ?? []).map((text) => ({ id: newId(), text }));
        if (ideas.length) {
          setSections((prev) =>
            prev.map((s) => (s.id === section.id ? { ...s, items: [...s.items, ...ideas] } : s))
          );
        }
      } catch (err: unknown) {
        const msg =
          (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
          'Could not generate ideas. Try again.';
        setAiError(msg);
      } finally {
        setAiLoading((prev) => ({ ...prev, [section.id]: false }));
      }
    },
    []
  );

  const totalItems = useMemo(
    () => sections.reduce((acc, s) => acc + s.items.length, 0),
    [sections]
  );

  return (
    <div className="mx-auto w-full max-w-6xl">
      <div className="mb-6 flex items-start gap-3">
        <div className="mt-0.5 rounded-xl bg-[var(--primary)]/10 p-2 text-[var(--primary)]">
          <Lightbulb size={20} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-[var(--foreground)]">Brainstorm</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Capture content ideas, hooks, and campaigns. Add them yourself or generate with AI.
            {totalItems > 0 ? ` ${totalItems} saved.` : ''}
          </p>
        </div>
      </div>

      {aiError ? (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
          {aiError}
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {sections.map((section) => (
          <div
            key={section.id}
            className="flex flex-col rounded-2xl border border-[var(--border)] bg-[var(--bg-surface)] p-4"
          >
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="font-semibold text-[var(--foreground)]">{section.title}</h2>
              <button
                type="button"
                onClick={() => removeSection(section.id)}
                className="rounded-md p-1 text-[var(--muted)] hover:bg-[var(--bg-hover)] hover:text-red-500"
                aria-label={`Remove ${section.title} section`}
                title="Remove section"
              >
                <X size={15} />
              </button>
            </div>

            <ul className="mb-3 space-y-2">
              {section.items.length === 0 ? (
                <li className="rounded-lg border border-dashed border-[var(--border)] px-3 py-3 text-center text-xs text-[var(--muted)]">
                  Nothing yet. Add an idea or generate with AI.
                </li>
              ) : (
                section.items.map((item) => (
                  <li
                    key={item.id}
                    className="group flex items-start gap-2 rounded-lg bg-[var(--bg-hover)] px-3 py-2 text-sm text-[var(--foreground)]"
                  >
                    <span className="flex-1 whitespace-pre-wrap break-words">{item.text}</span>
                    <button
                      type="button"
                      onClick={() => removeItem(section.id, item.id)}
                      className="shrink-0 text-[var(--muted)] opacity-0 transition-opacity hover:text-red-500 group-hover:opacity-100"
                      aria-label="Remove idea"
                    >
                      <Trash2 size={14} />
                    </button>
                  </li>
                ))
              )}
            </ul>

            <div className="mt-auto space-y-2">
              <input
                value={drafts[section.id] ?? ''}
                onChange={(e) => setDrafts((prev) => ({ ...prev, [section.id]: e.target.value }))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addItem(section.id, drafts[section.id] ?? '');
                  }
                }}
                placeholder={`Add to ${section.title}…`}
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] px-3 py-2 text-sm text-[var(--foreground)] placeholder:text-[var(--muted)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/40"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => addItem(section.id, drafts[section.id] ?? '')}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-[var(--border)] px-3 py-2 text-xs font-medium text-[var(--foreground)] hover:bg-[var(--bg-hover)]"
                >
                  <Plus size={14} /> Add
                </button>
                <button
                  type="button"
                  onClick={() => void generateWithAi(section)}
                  disabled={aiLoading[section.id]}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-lg gradient-cta-pro px-3 py-2 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
                >
                  {aiLoading[section.id] ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <Sparkles size={14} />
                  )}
                  AI
                </button>
              </div>
            </div>
          </div>
        ))}

        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-[var(--border)] bg-[var(--bg-surface)] p-4">
          {addingSection ? (
            <div className="w-full space-y-2">
              <input
                autoFocus
                value={newSectionTitle}
                onChange={(e) => setNewSectionTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addSection();
                  }
                  if (e.key === 'Escape') setAddingSection(false);
                }}
                placeholder="Section name (e.g. Reels, Offers)"
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] px-3 py-2 text-sm text-[var(--foreground)] placeholder:text-[var(--muted)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/40"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={addSection}
                  className="flex-1 rounded-lg gradient-cta-pro px-3 py-2 text-xs font-medium text-white hover:opacity-90"
                >
                  Add section
                </button>
                <button
                  type="button"
                  onClick={() => setAddingSection(false)}
                  className="rounded-lg border border-[var(--border)] px-3 py-2 text-xs font-medium text-[var(--foreground)] hover:bg-[var(--bg-hover)]"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setAddingSection(true)}
              className="flex items-center gap-2 text-sm font-medium text-[var(--muted)] hover:text-[var(--foreground)]"
            >
              <Plus size={18} /> Add a section
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
