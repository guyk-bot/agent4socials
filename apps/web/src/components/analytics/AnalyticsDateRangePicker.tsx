'use client';

import React, { useRef, useEffect, useMemo, useState } from 'react';
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react';
import { toLocalCalendarDate } from '@/lib/calendar-date';

/** Presets; anything beyond 30 days is premium (diamond). highlight = default purple tint for paid periods. */
const PRESETS = [
  { id: 'yesterday', label: 'Yesterday', premium: false, highlight: false },
  { id: 'last_week', label: 'Week', premium: false, highlight: false },
  { id: 'current_month', label: 'Current month', premium: false, highlight: false },
  { id: 'last_30', label: '30 days', premium: false, highlight: false },
  { id: 'last_3_months', label: '3 months', premium: true, highlight: true },
  { id: 'last_6_months', label: '6 months', premium: true, highlight: true },
  { id: 'last_12_months', label: '12 months', premium: true, highlight: true },
] as const;

function getPresetRange(
  id: string,
  now: Date
): { start: string; end: string } {
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);
  let start: Date;

  if (id === 'yesterday') {
    start = new Date(now);
    start.setDate(start.getDate() - 1);
    start.setHours(0, 0, 0, 0);
    return { start: toLocalCalendarDate(start), end: toLocalCalendarDate(start) };
  }
  if (id === 'last_week') {
    start = new Date(now);
    start.setDate(start.getDate() - 6);
    start.setHours(0, 0, 0, 0);
    return { start: toLocalCalendarDate(start), end: toLocalCalendarDate(end) };
  }
  if (id === 'current_month') {
    start = new Date(now.getFullYear(), now.getMonth(), 1);
    return { start: toLocalCalendarDate(start), end: toLocalCalendarDate(end) };
  }
  if (id === 'last_30') {
    start = new Date(now);
    start.setDate(start.getDate() - 29);
    start.setHours(0, 0, 0, 0);
    return { start: toLocalCalendarDate(start), end: toLocalCalendarDate(end) };
  }
  if (id === 'last_3_months') {
    start = new Date(now);
    start.setMonth(start.getMonth() - 3);
    start.setHours(0, 0, 0, 0);
    return { start: toLocalCalendarDate(start), end: toLocalCalendarDate(end) };
  }
  if (id === 'last_6_months') {
    start = new Date(now);
    start.setMonth(start.getMonth() - 6);
    start.setHours(0, 0, 0, 0);
    return { start: toLocalCalendarDate(start), end: toLocalCalendarDate(end) };
  }
  if (id === 'last_12_months') {
    start = new Date(now);
    start.setFullYear(start.getFullYear() - 1);
    start.setHours(0, 0, 0, 0);
    return { start: toLocalCalendarDate(start), end: toLocalCalendarDate(end) };
  }

  start = new Date(now);
  start.setDate(start.getDate() - 29);
  start.setHours(0, 0, 0, 0);
  return { start: toLocalCalendarDate(start), end: toLocalCalendarDate(end) };
}

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

/** Single month grid; compact=true for 12-month row (smaller cells). */
function CalendarGrid({
  year,
  month,
  start,
  end,
  onSelectDay,
  today,
  compact = false,
  title,
  showMonthTitle = true,
}: {
  year: number;
  month: number;
  start: string | null;
  end: string | null;
  onSelectDay: (dateStr: string) => void;
  today: string;
  compact?: boolean;
  title?: string;
  showMonthTitle?: boolean;
}) {
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);
  const startDay = first.getDay();
  const daysInMonth = last.getDate();
  const prevMonth = new Date(year, month, 0);
  const prevDays = prevMonth.getDate();

  const rows: (string | null)[][] = [];
  let row: (string | null)[] = [];
  for (let i = 0; i < startDay; i++) {
    const d = prevDays - startDay + i + 1;
    row.push(`${prevMonth.getFullYear()}-${String(prevMonth.getMonth() + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
  }
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    row.push(dateStr);
    if (row.length === 7) {
      rows.push(row);
      row = [];
    }
  }
  const nextMonth = new Date(year, month + 1, 1);
  let nextD = 1;
  while (row.length < 7) {
    row.push(`${nextMonth.getFullYear()}-${String(nextMonth.getMonth() + 1).padStart(2, '0')}-${String(nextD).padStart(2, '0')}`);
    nextD++;
  }
  if (row.length) rows.push(row);

  const isInRange = (dateStr: string) => {
    if (!start || !end) return false;
    return dateStr >= start && dateStr <= end;
  };
  const isStart = (dateStr: string) => start === dateStr;
  const isEnd = (dateStr: string) => end === dateStr;
  const isCurrentMonth = (dateStr: string) => dateStr.startsWith(`${year}-${String(month + 1).padStart(2, '0')}-`);

  // Tighten horizontal day spacing; keep vertical a little roomier.
  const gapX = compact ? 'gap-x-0' : 'gap-x-0';
  const gapY = compact ? 'gap-y-0.5' : 'gap-y-0.5';
  const cellSize = compact ? 'w-8 min-w-8 h-8 min-h-8 text-xs' : 'w-9 h-9 min-w-9 min-h-9 sm:w-10 sm:h-10 sm:min-w-10 sm:min-h-10 text-sm';
  const headerSize = compact ? 'h-5 text-[10px]' : 'h-6 text-xs';

  return (
    <div className="calendar-grid shrink-0 w-full min-w-[336px]">
      {showMonthTitle && (title || !compact) && (
        <div className={`flex items-center justify-center font-semibold text-neutral-700 mb-2 ${compact ? 'text-xs' : 'text-base'}`}>
          {title ?? new Date(year, month).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
        </div>
      )}
      <div className={`grid grid-cols-7 ${gapX} mb-1`}>
        {WEEKDAYS.map((w, i) => (
          <div key={i} className={`${headerSize} flex items-center justify-center font-semibold text-neutral-500`}>
            {w}
          </div>
        ))}
      </div>
      <div className={`grid grid-cols-7 ${gapX} ${gapY} min-h-0 content-start`}>
        {rows.flat().map((dateStr, i) => {
          if (!dateStr) return <div key={i} />;
          const inRange = isInRange(dateStr);
          const startOrEnd = isStart(dateStr) || isEnd(dateStr);
          const isToday = dateStr === today;
          const currentMonth = isCurrentMonth(dateStr);
          return (
            <button
              key={dateStr + i}
              type="button"
              onClick={() => onSelectDay(dateStr)}
              className={`
                aspect-square ${cellSize} rounded-lg font-semibold
                flex items-center justify-center p-0 leading-none tabular-nums
                ${!currentMonth ? 'text-neutral-300' : 'text-neutral-800'}
                ${inRange && !startOrEnd ? 'bg-violet-100' : ''}
                ${!inRange && !startOrEnd ? 'hover:bg-neutral-100' : ''}
                ${startOrEnd ? 'bg-violet-600 text-white hover:bg-violet-700' : ''}
                ${isToday && !startOrEnd ? 'ring-2 ring-violet-400 ring-offset-1' : ''}
              `}
            >
              {new Date(dateStr + 'T12:00:00').getDate()}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export interface AnalyticsDateRangePickerProps {
  start: string;
  end: string;
  onChange: (range: { start: string; end: string }) => void;
  onUpgrade?: () => void;
  /** When true, the dropdown is open by default. Default false so it does not open on every refresh. */
  defaultOpen?: boolean;
  className?: string;
}

export function AnalyticsDateRangePicker({
  start,
  end,
  onChange,
  defaultOpen = false,
  className = '',
}: AnalyticsDateRangePickerProps) {
  const [open, setOpen] = useState(defaultOpen);
  const containerRef = useRef<HTMLDivElement>(null);
  const now = useMemo(() => new Date(), []);
  const todayStr = useMemo(() => toLocalCalendarDate(now), [now]);

  const [calendarMonth, setCalendarMonth] = useState(() => {
    const s = start ? new Date(start + 'T12:00:00') : now;
    return { year: s.getFullYear(), month: s.getMonth() };
  });

  useEffect(() => {
    if (start) {
      const s = new Date(start + 'T12:00:00');
      setCalendarMonth({ year: s.getFullYear(), month: s.getMonth() });
    }
  }, [start]);

  const [rangeSelectPhase, setRangeSelectPhase] = useState<'start' | 'end'>('start');
  const [tempStart, setTempStart] = useState<string | null>(start || null);
  const [tempEnd, setTempEnd] = useState<string | null>(end || null);

  useEffect(() => {
    setTempStart(start || null);
    setTempEnd(end || null);
  }, [start, end]);

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

  const handlePreset = (id: string) => {
    const range = getPresetRange(id, now);
    onChange({ start: range.start, end: range.end });
    setTempStart(range.start);
    setTempEnd(range.end);
    const d = new Date(range.start + 'T12:00:00');
    setCalendarMonth({ year: d.getFullYear(), month: d.getMonth() });
    setOpen(false);
  };

  const handleCalendarDay = (dateStr: string) => {
    if (rangeSelectPhase === 'start') {
      setTempStart(dateStr);
      setTempEnd(dateStr);
      setRangeSelectPhase('end');
    } else {
      const a = tempStart!;
      const b = dateStr;
      const s = a <= b ? a : b;
      const e = a <= b ? b : a;
      setTempStart(s);
      setTempEnd(e);
      onChange({ start: s, end: e });
      setRangeSelectPhase('start');
    }
  };

  const displayStart = tempStart ?? start;
  const displayEnd = tempEnd ?? end;

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 px-3 py-2 bg-white border border-neutral-200 rounded-lg text-sm font-medium text-neutral-700 hover:bg-neutral-50 hover:border-neutral-300 transition-colors min-w-0"
      >
        <Calendar size={16} className="text-neutral-500 shrink-0" />
        <span className="truncate max-w-[220px]">{formatRange()}</span>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 z-50 flex gap-8 p-6 bg-white border border-neutral-200 rounded-2xl shadow-xl min-w-[580px] max-w-[96vw] overflow-visible">
          <div className="min-w-[200px] w-56 shrink-0">
            <p className="px-0 py-2 text-sm font-semibold text-neutral-500 uppercase tracking-wider mb-3">Presets</p>
            <div className="space-y-1">
              {PRESETS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => handlePreset(p.id)}
                  className={`w-full text-left px-4 py-3 text-base font-medium rounded-lg transition-colors flex items-center justify-between gap-2 ${
                    p.highlight
                      ? 'bg-violet-50 text-violet-800 hover:bg-violet-100 hover:text-violet-900'
                      : 'text-neutral-800 hover:bg-neutral-100 hover:text-neutral-700'
                  }`}
                >
                  <span>{p.label}</span>
                  {p.premium && (
                    <img src="/dim.svg" alt="" className="h-4 w-4 object-contain shrink-0 opacity-80" width={16} height={16} aria-hidden />
                  )}
                </button>
              ))}
            </div>
          </div>

          <div className="border-l border-neutral-100 pl-6 flex-1 min-w-[360px] overflow-visible">
            <p className="text-sm font-semibold text-neutral-500 uppercase tracking-wider mb-3">Custom range</p>
            <div className="flex items-center gap-3 flex-wrap mb-5">
              <input
                type="date"
                value={displayStart}
                onChange={(e) => {
                  const v = e.target.value;
                  setTempStart(v);
                  if (displayEnd && v <= displayEnd) onChange({ start: v, end: displayEnd });
                }}
                className="flex-1 min-w-[140px] text-base border border-neutral-200 rounded-xl px-4 py-3 focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500"
              />
              <span className="text-neutral-400 text-base">–</span>
              <input
                type="date"
                value={displayEnd}
                max={todayStr}
                onChange={(e) => {
                  const v = e.target.value;
                  setTempEnd(v);
                  if (displayStart && v >= displayStart) onChange({ start: displayStart, end: v });
                }}
                className="flex-1 min-w-[140px] text-base border border-neutral-200 rounded-xl px-4 py-3 focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500"
              />
            </div>
            <div className="border border-neutral-200 rounded-xl p-4 bg-neutral-50/50 min-h-0 flex flex-col w-full">
              <div className="flex items-center justify-between mb-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setCalendarMonth((m) => (m.month === 0 ? { year: m.year - 1, month: 11 } : { year: m.year, month: m.month - 1 }))}
                  className="p-2.5 rounded-lg text-neutral-500 hover:bg-neutral-200 hover:text-neutral-800"
                  aria-label="Previous month"
                >
                  <ChevronLeft size={24} />
                </button>
                <span className="text-lg font-semibold text-neutral-800">
                  {new Date(calendarMonth.year, calendarMonth.month).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
                </span>
                <button
                  type="button"
                  onClick={() => setCalendarMonth((m) => (m.month === 11 ? { year: m.year + 1, month: 0 } : { year: m.year, month: m.month + 1 }))}
                  className="p-2.5 rounded-lg text-neutral-500 hover:bg-neutral-200 hover:text-neutral-800"
                  aria-label="Next month"
                >
                  <ChevronRight size={24} />
                </button>
              </div>
              <div className="flex-1 min-h-0 flex flex-col">
                <CalendarGrid
                  year={calendarMonth.year}
                  month={calendarMonth.month}
                  start={displayStart || null}
                  end={displayEnd || null}
                  onSelectDay={handleCalendarDay}
                  today={todayStr}
                  showMonthTitle={false}
                />
              </div>
              <div className="flex items-center justify-between mt-4 pt-3 border-t border-neutral-200 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    setTempStart(null);
                    setTempEnd(null);
                    setRangeSelectPhase('start');
                  }}
                  className="text-sm font-medium text-neutral-500 hover:text-neutral-700"
                >
                  Clear
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setTempStart(todayStr);
                    setTempEnd(todayStr);
                    onChange({ start: todayStr, end: todayStr });
                    setRangeSelectPhase('start');
                  }}
                  className="text-sm font-medium text-violet-600 hover:text-violet-800"
                >
                  Today
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
