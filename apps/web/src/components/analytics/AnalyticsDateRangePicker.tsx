'use client';

import React, { useRef, useEffect, useMemo } from 'react';
import { Calendar } from 'lucide-react';

const PRESET_FREE = [
  { id: 'yesterday', label: 'Yesterday', days: 1 },
  { id: 'last_week', label: 'Last week', days: 7 },
  { id: 'current_month', label: 'Current month', days: null },
  { id: 'last_30', label: 'Last 30 days', days: 30 },
] as const;

const PRESET_PREMIUM = [
  { id: 'previous_month', label: 'Previous month', days: null, months: 1 },
  { id: 'last_3_months', label: 'Last 3 months', days: 90 },
  { id: 'last_6_months', label: 'Last 6 months', days: 180 },
  { id: 'last_12_months', label: 'Last 12 months', days: 365 },
] as const;

function getPresetRange(
  id: string,
  now: Date
): { start: string; end: string; days: number } {
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);
  let start: Date;

  if (id === 'yesterday') {
    start = new Date(now);
    start.setDate(start.getDate() - 1);
    start.setHours(0, 0, 0, 0);
    return {
      start: start.toISOString().slice(0, 10),
      end: start.toISOString().slice(0, 10),
      days: 1,
    };
  }
  if (id === 'last_week') {
    start = new Date(now);
    start.setDate(start.getDate() - 6);
    start.setHours(0, 0, 0, 0);
    return {
      start: start.toISOString().slice(0, 10),
      end: end.toISOString().slice(0, 10),
      days: 7,
    };
  }
  if (id === 'current_month') {
    start = new Date(now.getFullYear(), now.getMonth(), 1);
    const days = Math.ceil((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)) + 1;
    return {
      start: start.toISOString().slice(0, 10),
      end: end.toISOString().slice(0, 10),
      days,
    };
  }
  if (id === 'last_30') {
    start = new Date(now);
    start.setDate(start.getDate() - 29);
    start.setHours(0, 0, 0, 0);
    return {
      start: start.toISOString().slice(0, 10),
      end: end.toISOString().slice(0, 10),
      days: 30,
    };
  }
  if (id === 'previous_month') {
    start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const endPrev = new Date(now.getFullYear(), now.getMonth(), 0);
    return {
      start: start.toISOString().slice(0, 10),
      end: endPrev.toISOString().slice(0, 10),
      days: endPrev.getDate(),
    };
  }
  if (id === 'last_3_months') {
    start = new Date(now);
    start.setMonth(start.getMonth() - 3);
    start.setHours(0, 0, 0, 0);
    const days = Math.ceil((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000));
    return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10), days };
  }
  if (id === 'last_6_months') {
    start = new Date(now);
    start.setMonth(start.getMonth() - 6);
    start.setHours(0, 0, 0, 0);
    const days = Math.ceil((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000));
    return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10), days };
  }
  if (id === 'last_12_months') {
    start = new Date(now);
    start.setFullYear(start.getFullYear() - 1);
    start.setHours(0, 0, 0, 0);
    const days = Math.ceil((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000));
    return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10), days };
  }

  start = new Date(now);
  start.setDate(start.getDate() - 29);
  start.setHours(0, 0, 0, 0);
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
    days: 30,
  };
}

export interface AnalyticsDateRangePickerProps {
  start: string;
  end: string;
  onChange: (range: { start: string; end: string }) => void;
  onUpgrade?: () => void;
  className?: string;
}

export function AnalyticsDateRangePicker({
  start,
  end,
  onChange,
  onUpgrade,
  className = '',
}: AnalyticsDateRangePickerProps) {
  const [open, setOpen] = React.useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const now = useMemo(() => new Date(), []);

  const days = useMemo(() => {
    if (!start || !end) return 0;
    const s = new Date(start).getTime();
    const e = new Date(end).getTime();
    return Math.max(1, Math.ceil((e - s) / (24 * 60 * 60 * 1000)) + 1);
  }, [start, end]);

  const isPremiumRange = days > 30;

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    if (open) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [open]);

  const formatRange = () => {
    if (!start || !end) return 'Select period';
    try {
      const s = new Date(start);
      const e = new Date(end);
      return `${s.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })} - ${e.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`;
    } catch {
      return `${start} - ${end}`;
    }
  };

  /** Apply preset (including premium). For testing all ranges are allowed; visuals (diamond, amber) unchanged. */
  const handlePreset = (id: string) => {
    const range = getPresetRange(id, now);
    onChange({ start: range.start, end: range.end });
    setOpen(false);
  };

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 px-3 py-2 bg-white border border-neutral-200 rounded-lg text-sm font-medium text-neutral-700 hover:bg-neutral-50 hover:border-neutral-300 transition-colors min-w-0"
      >
        <Calendar size={16} className="text-neutral-500 shrink-0" />
        <span className="truncate max-w-[220px]">{formatRange()}</span>
        {isPremiumRange && (
          <span className="shrink-0 w-5 h-5 rounded-full bg-amber-100 flex items-center justify-center" title="Premium">
            <img src="/dim.svg" alt="" className="w-3 h-3 object-contain" width={12} height={12} />
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 z-50 w-72 bg-white border border-neutral-200 rounded-xl shadow-lg py-2">
          <p className="px-3 py-1.5 text-xs font-semibold text-neutral-500 uppercase tracking-wider">Presets</p>
          {PRESET_FREE.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => handlePreset(p.id)}
              className="w-full text-left px-3 py-2 text-sm font-medium text-neutral-800 hover:bg-neutral-100 flex items-center justify-between"
            >
              {p.label}
            </button>
          ))}
          <p className="px-3 py-1.5 mt-1 text-xs font-semibold text-neutral-500 uppercase tracking-wider border-t border-neutral-100 pt-2">
            Premium
          </p>
          {PRESET_PREMIUM.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => handlePreset(p.id)}
              className="w-full text-left px-3 py-2 text-sm font-medium flex items-center justify-between gap-2 hover:bg-amber-50/80 group"
            >
              <span className="bg-amber-100/90 text-amber-900 group-hover:bg-amber-200/90 px-2 py-0.5 rounded-md">
                {p.label}
              </span>
              <img src="/dim.svg" alt="" className="w-4 h-4 object-contain shrink-0" width={16} height={16} />
            </button>
          ))}
          <div className="border-t border-neutral-100 mt-2 pt-2 px-3 pb-2">
            <p className="text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-2">Custom range</p>
            <div className="flex items-center gap-2 flex-wrap">
              <input
                type="date"
                value={start}
                onChange={(e) => onChange({ ...{ start, end }, start: e.target.value })}
                className="flex-1 min-w-0 text-sm border border-neutral-200 rounded-lg px-2 py-1.5"
              />
              <span className="text-neutral-400">–</span>
              <input
                type="date"
                value={end}
                onChange={(e) => onChange({ ...{ start, end }, end: e.target.value })}
                className="flex-1 min-w-0 text-sm border border-neutral-200 rounded-lg px-2 py-1.5"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
