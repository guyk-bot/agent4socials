'use client';

import React, { useRef, useEffect, useMemo, useState } from 'react';
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react';

const PRESETS = [
  { id: 'yesterday', label: 'Yesterday' },
  { id: 'last_week', label: 'Last week' },
  { id: 'current_month', label: 'Current month' },
  { id: 'last_30', label: 'Last 30 days' },
  { id: 'previous_month', label: 'Previous month' },
  { id: 'last_3_months', label: 'Last 3 months' },
  { id: 'last_6_months', label: 'Last 6 months' },
  { id: 'last_12_months', label: 'Last 12 months' },
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
    return { start: start.toISOString().slice(0, 10), end: start.toISOString().slice(0, 10) };
  }
  if (id === 'last_week') {
    start = new Date(now);
    start.setDate(start.getDate() - 6);
    start.setHours(0, 0, 0, 0);
    return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
  }
  if (id === 'current_month') {
    start = new Date(now.getFullYear(), now.getMonth(), 1);
    return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
  }
  if (id === 'last_30') {
    start = new Date(now);
    start.setDate(start.getDate() - 29);
    start.setHours(0, 0, 0, 0);
    return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
  }
  if (id === 'previous_month') {
    start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const endPrev = new Date(now.getFullYear(), now.getMonth(), 0);
    return { start: start.toISOString().slice(0, 10), end: endPrev.toISOString().slice(0, 10) };
  }
  if (id === 'last_3_months') {
    start = new Date(now);
    start.setMonth(start.getMonth() - 3);
    start.setHours(0, 0, 0, 0);
    return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
  }
  if (id === 'last_6_months') {
    start = new Date(now);
    start.setMonth(start.getMonth() - 6);
    start.setHours(0, 0, 0, 0);
    return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
  }
  if (id === 'last_12_months') {
    start = new Date(now);
    start.setFullYear(start.getFullYear() - 1);
    start.setHours(0, 0, 0, 0);
    return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
  }

  start = new Date(now);
  start.setDate(start.getDate() - 29);
  start.setHours(0, 0, 0, 0);
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

function CalendarGrid({
  year,
  month,
  start,
  end,
  onSelectDay,
  today,
}: {
  year: number;
  month: number;
  start: string | null;
  end: string | null;
  onSelectDay: (dateStr: string) => void;
  today: string;
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

  return (
    <div className="calendar-grid">
      <div className="grid grid-cols-7 gap-0.5 mb-1">
        {WEEKDAYS.map((w, i) => (
          <div key={i} className="text-center text-xs font-medium text-neutral-500 py-1">
            {w}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-0.5">
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
                w-8 h-8 rounded-md text-sm flex items-center justify-center
                ${!currentMonth ? 'text-neutral-300' : 'text-neutral-800'}
                ${inRange ? 'bg-violet-100' : 'hover:bg-neutral-100'}
                ${startOrEnd ? 'bg-violet-600 text-white hover:bg-violet-700' : ''}
                ${isToday && !startOrEnd ? 'ring-1 ring-violet-400 ring-offset-1' : ''}
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
  /** When true, the dropdown is open by default so the user can quickly change dates. */
  defaultOpen?: boolean;
  className?: string;
}

export function AnalyticsDateRangePicker({
  start,
  end,
  onChange,
  defaultOpen = true,
  className = '',
}: AnalyticsDateRangePickerProps) {
  const [open, setOpen] = useState(defaultOpen);
  const containerRef = useRef<HTMLDivElement>(null);
  const now = useMemo(() => new Date(), []);
  const todayStr = useMemo(() => now.toISOString().slice(0, 10), [now]);

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
    setCalendarMonth({
      year: new Date(range.start + 'T12:00:00').getFullYear(),
      month: new Date(range.start + 'T12:00:00').getMonth(),
    });
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

  const goPrevMonth = () => {
    setCalendarMonth((m) => {
      if (m.month === 0) return { year: m.year - 1, month: 11 };
      return { year: m.year, month: m.month - 1 };
    });
  };
  const goNextMonth = () => {
    setCalendarMonth((m) => {
      if (m.month === 11) return { year: m.year + 1, month: 0 };
      return { year: m.year, month: m.month + 1 };
    });
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
        <div className="absolute right-0 top-full mt-1 z-50 flex gap-4 p-4 bg-white border border-neutral-200 rounded-xl shadow-lg">
          <div className="w-52">
            <p className="px-0 py-1.5 text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-2">Presets</p>
            <div className="space-y-0.5">
              {PRESETS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => handlePreset(p.id)}
                  className="w-full text-left px-3 py-2 text-sm font-medium text-neutral-800 hover:bg-violet-50 hover:text-violet-800 rounded-md transition-colors"
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          <div className="border-l border-neutral-100 pl-4">
            <p className="text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-2">Custom range</p>
            <div className="flex items-center gap-2 flex-wrap mb-3">
              <input
                type="date"
                value={displayStart}
                onChange={(e) => {
                  const v = e.target.value;
                  setTempStart(v);
                  if (displayEnd && v <= displayEnd) onChange({ start: v, end: displayEnd });
                }}
                className="flex-1 min-w-0 text-sm border border-neutral-200 rounded-lg px-2 py-1.5 focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500"
              />
              <span className="text-neutral-400">–</span>
              <input
                type="date"
                value={displayEnd}
                onChange={(e) => {
                  const v = e.target.value;
                  setTempEnd(v);
                  if (displayStart && v >= displayStart) onChange({ start: displayStart, end: v });
                }}
                className="flex-1 min-w-0 text-sm border border-neutral-200 rounded-lg px-2 py-1.5 focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500"
              />
            </div>
            <div className="border border-neutral-200 rounded-lg p-3 bg-neutral-50/50">
              <div className="flex items-center justify-between mb-2">
                <button
                  type="button"
                  onClick={goPrevMonth}
                  className="p-1 rounded text-neutral-500 hover:bg-neutral-200 hover:text-neutral-800"
                  aria-label="Previous month"
                >
                  <ChevronLeft size={18} />
                </button>
                <span className="text-sm font-semibold text-neutral-800">
                  {new Date(calendarMonth.year, calendarMonth.month).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
                </span>
                <button
                  type="button"
                  onClick={goNextMonth}
                  className="p-1 rounded text-neutral-500 hover:bg-neutral-200 hover:text-neutral-800"
                  aria-label="Next month"
                >
                  <ChevronRight size={18} />
                </button>
              </div>
              <CalendarGrid
                year={calendarMonth.year}
                month={calendarMonth.month}
                start={displayStart || null}
                end={displayEnd || null}
                onSelectDay={handleCalendarDay}
                today={todayStr}
              />
              <div className="flex items-center justify-between mt-3 pt-2 border-t border-neutral-200">
                <button
                  type="button"
                  onClick={() => {
                    setTempStart(null);
                    setTempEnd(null);
                    setRangeSelectPhase('start');
                  }}
                  className="text-xs font-medium text-neutral-500 hover:text-neutral-700"
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
                  className="text-xs font-medium text-violet-600 hover:text-violet-800"
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
