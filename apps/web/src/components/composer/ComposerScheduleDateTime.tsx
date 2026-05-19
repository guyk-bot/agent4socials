'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react';
import { toLocalCalendarDate } from '@/lib/calendar-date';
import {
  SCHEDULE_TEN_MINUTE_OPTIONS,
  clampScheduleLocalToFloorMin,
} from '@/lib/schedule-ten-minute';

const HOUR_OPTIONS_24H = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

function scheduleDatePart(value: string): string {
  return value.includes('T') ? value.split('T')[0]! : '';
}

function scheduleTimePart(value: string): string {
  if (!value.includes('T')) return '';
  const t = value.split('T')[1] ?? '';
  return t.slice(0, 5);
}

function ScheduleScrollList({
  label,
  options,
  value,
  onChange,
  isDark,
}: {
  label: string;
  options: readonly string[];
  value: string;
  onChange: (next: string) => void;
  isDark: boolean;
}) {
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = listRef.current?.querySelector('[data-selected="true"]');
    el?.scrollIntoView({ block: 'nearest' });
  }, [value]);

  return (
    <div className="space-y-1">
      <div className="text-xs font-medium text-neutral-500">{label}</div>
      <div
        ref={listRef}
        className={`composer-schedule-scroll-list w-full max-h-40 overflow-y-auto rounded-xl border p-1 ${
          isDark ? 'border-neutral-700 bg-neutral-900' : 'border-neutral-200 bg-white'
        }`}
        role="listbox"
        aria-label={label}
      >
        {options.map((opt) => {
          const selected = opt === value;
          return (
            <button
              key={opt}
              type="button"
              role="option"
              aria-selected={selected}
              data-selected={selected ? 'true' : 'false'}
              onClick={() => onChange(opt)}
              className={`composer-schedule-scroll-item flex w-full items-center justify-center rounded-lg px-2 py-1.5 text-sm font-medium tabular-nums ${
                selected ? 'is-selected' : isDark ? 'text-neutral-200' : 'text-neutral-800'
              }`}
            >
              {opt}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ScheduleCalendarGrid({
  year,
  month,
  selectedDate,
  minDate,
  onSelectDay,
  isDark,
}: {
  year: number;
  month: number;
  selectedDate: string;
  minDate: string;
  onSelectDay: (dateStr: string) => void;
  isDark: boolean;
}) {
  const today = toLocalCalendarDate(new Date());
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);
  const startDay = first.getDay();
  const daysInMonth = last.getDate();
  const prevMonth = new Date(year, month, 0);
  const prevDays = prevMonth.getDate();

  const cells: string[] = [];
  for (let i = 0; i < startDay; i++) {
    const d = prevDays - startDay + i + 1;
    cells.push(
      `${prevMonth.getFullYear()}-${String(prevMonth.getMonth() + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    );
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push(`${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
  }
  const nextMonth = new Date(year, month + 1, 1);
  let nextD = 1;
  while (cells.length % 7 !== 0) {
    cells.push(
      `${nextMonth.getFullYear()}-${String(nextMonth.getMonth() + 1).padStart(2, '0')}-${String(nextD).padStart(2, '0')}`
    );
    nextD++;
  }

  const monthPrefix = `${year}-${String(month + 1).padStart(2, '0')}-`;

  return (
    <div className="w-full min-w-[280px]">
      <div className="grid grid-cols-7 gap-0.5 mb-1">
        {WEEKDAYS.map((w, i) => (
          <div
            key={i}
            className={`h-6 flex items-center justify-center text-xs font-semibold ${isDark ? 'text-neutral-400' : 'text-neutral-500'}`}
          >
            {w}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-0.5">
        {cells.map((dateStr, i) => {
          const inCurrentMonth = dateStr.startsWith(monthPrefix);
          const selected = dateStr === selectedDate;
          const disabled = dateStr < minDate;
          const isToday = dateStr === today;
          return (
            <button
              key={`${dateStr}-${i}`}
              type="button"
              disabled={disabled}
              onClick={() => onSelectDay(dateStr)}
              className={`
                h-9 rounded-lg text-sm font-semibold tabular-nums flex items-center justify-center
                ${!inCurrentMonth ? (isDark ? 'text-neutral-600' : 'text-neutral-300') : ''}
                ${inCurrentMonth && !selected && !disabled ? (isDark ? 'text-neutral-100 hover:bg-neutral-800' : 'text-neutral-800 hover:bg-neutral-100') : ''}
                ${selected ? 'composer-schedule-day-selected' : ''}
                ${isToday && !selected ? 'ring-2 ring-[var(--color-accent-orange-light)] ring-offset-0' : ''}
                ${disabled ? 'opacity-30 cursor-not-allowed' : ''}
              `}
            >
              {new Date(`${dateStr}T12:00:00`).getDate()}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export type ComposerScheduleDateTimeProps = {
  scheduledAt: string;
  minLocal: string;
  onChange: (next: string) => void;
  isDark: boolean;
};

export function ComposerScheduleDateTime({ scheduledAt, minLocal, onChange, isDark }: ComposerScheduleDateTimeProps) {
  const [calendarOpen, setCalendarOpen] = useState(false);
  const calendarRef = useRef<HTMLDivElement>(null);

  const selectedDate = scheduleDatePart(scheduledAt) || scheduleDatePart(minLocal);
  const selectedHour = scheduleTimePart(scheduledAt).split(':')[0] || scheduleTimePart(minLocal).split(':')[0]!;
  const rawMin = scheduleTimePart(scheduledAt).split(':')[1] || scheduleTimePart(minLocal).split(':')[1];
  const selectedMinute = (SCHEDULE_TEN_MINUTE_OPTIONS as readonly string[]).includes(rawMin)
    ? rawMin
    : scheduleTimePart(minLocal).split(':')[1]!;

  const minDate = scheduleDatePart(minLocal);

  const [viewMonth, setViewMonth] = useState(() => {
    const base = selectedDate ? new Date(`${selectedDate}T12:00:00`) : new Date();
    return { year: base.getFullYear(), month: base.getMonth() };
  });

  useEffect(() => {
    if (!calendarOpen) return;
    const onPointerDown = (e: MouseEvent) => {
      if (calendarRef.current && !calendarRef.current.contains(e.target as Node)) {
        setCalendarOpen(false);
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [calendarOpen]);

  useEffect(() => {
    if (!selectedDate) return;
    const d = new Date(`${selectedDate}T12:00:00`);
    setViewMonth({ year: d.getFullYear(), month: d.getMonth() });
  }, [selectedDate]);

  const updateDateTime = (nextDate: string, nextHour: string, nextMinute: string) => {
    const raw = `${nextDate}T${nextHour}:${nextMinute}`;
    onChange(clampScheduleLocalToFloorMin(raw, minLocal));
  };

  const monthTitle = useMemo(
    () => new Date(viewMonth.year, viewMonth.month).toLocaleDateString(undefined, { month: 'long', year: 'numeric' }),
    [viewMonth.year, viewMonth.month]
  );

  const fieldClass = `w-full flex items-center justify-between gap-2 rounded-xl border px-3 py-2.5 text-sm ${
    isDark ? 'border-neutral-700 bg-neutral-900 text-neutral-100' : 'border-neutral-200 bg-white text-neutral-900'
  }`;

  return (
    <div className="composer-schedule-scope space-y-2">
      <div ref={calendarRef} className="relative">
        <button
          type="button"
          onClick={() => setCalendarOpen((o) => !o)}
          className={`${fieldClass} text-left`}
          aria-expanded={calendarOpen}
          aria-haspopup="dialog"
        >
          <span className="tabular-nums">
            {selectedDate
              ? new Date(`${selectedDate}T12:00:00`).toLocaleDateString(undefined, {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                })
              : 'Select date'}
          </span>
          <Calendar size={18} className="shrink-0 text-[var(--color-accent-orange-light)]" />
        </button>
        {calendarOpen ? (
          <div
            className={`absolute left-0 z-40 mt-1 w-full min-w-[300px] rounded-xl border p-3 shadow-xl ${
              isDark ? 'border-neutral-700 bg-neutral-900' : 'border-neutral-200 bg-white'
            }`}
            role="dialog"
            aria-label="Choose date"
          >
            <div className="flex items-center justify-between gap-2 mb-3">
              <button
                type="button"
                onClick={() =>
                  setViewMonth((m) => {
                    const d = new Date(m.year, m.month - 1, 1);
                    return { year: d.getFullYear(), month: d.getMonth() };
                  })
                }
                className="p-1 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800"
                aria-label="Previous month"
              >
                <ChevronLeft size={18} />
              </button>
              <span className={`text-sm font-semibold ${isDark ? 'text-neutral-100' : 'text-neutral-800'}`}>{monthTitle}</span>
              <button
                type="button"
                onClick={() =>
                  setViewMonth((m) => {
                    const d = new Date(m.year, m.month + 1, 1);
                    return { year: d.getFullYear(), month: d.getMonth() };
                  })
                }
                className="p-1 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800"
                aria-label="Next month"
              >
                <ChevronRight size={18} />
              </button>
            </div>
            <ScheduleCalendarGrid
              year={viewMonth.year}
              month={viewMonth.month}
              selectedDate={selectedDate}
              minDate={minDate}
              onSelectDay={(dateStr) => {
                updateDateTime(dateStr, selectedHour, selectedMinute);
                setCalendarOpen(false);
              }}
              isDark={isDark}
            />
            <div className="mt-3 flex items-center justify-end gap-3 text-xs">
              <button
                type="button"
                className="composer-schedule-link text-[var(--color-accent-orange-light)] hover:underline"
                onClick={() => {
                  const today = toLocalCalendarDate(new Date());
                  if (today >= minDate) {
                    updateDateTime(today, selectedHour, selectedMinute);
                  }
                  setCalendarOpen(false);
                }}
              >
                Today
              </button>
            </div>
          </div>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <ScheduleScrollList
          label="Hour (00-23)"
          options={HOUR_OPTIONS_24H}
          value={selectedHour}
          onChange={(hh) => updateDateTime(selectedDate, hh, selectedMinute)}
          isDark={isDark}
        />
        <ScheduleScrollList
          label="Minute (10-minute steps)"
          options={SCHEDULE_TEN_MINUTE_OPTIONS}
          value={selectedMinute}
          onChange={(mm) => updateDateTime(selectedDate, selectedHour, mm)}
          isDark={isDark}
        />
      </div>
    </div>
  );
}
