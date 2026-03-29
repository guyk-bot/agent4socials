'use client';

import React from 'react';
import { Calendar, RefreshCw, Download, ChevronDown } from 'lucide-react';

const PLATFORM_OPTIONS = [
  { id: 'INSTAGRAM', label: 'Instagram' },
  { id: 'FACEBOOK', label: 'Facebook' },
  { id: 'TIKTOK', label: 'TikTok' },
  { id: 'YOUTUBE', label: 'YouTube' },
  { id: 'TWITTER', label: 'Twitter/X' },
  { id: 'LINKEDIN', label: 'LinkedIn' },
  { id: 'PINTEREST', label: 'Pinterest' },
];

type SummaryFiltersBarProps = {
  dateStart: string;
  dateEnd: string;
  onDateChange: (start: string, end: string) => void;
  selectedPlatforms: string[];
  onPlatformsChange: (platforms: string[]) => void;
  compareEnabled: boolean;
  onCompareToggle: (v: boolean) => void;
  onExport: (format: 'csv' | 'pdf') => void;
  onRefresh: () => void;
};

export function SummaryFiltersBar({
  dateStart,
  dateEnd,
  onDateChange,
  selectedPlatforms,
  onPlatformsChange,
  compareEnabled,
  onCompareToggle,
  onExport,
  onRefresh,
}: SummaryFiltersBarProps) {
  const [platformDropdownOpen, setPlatformDropdownOpen] = React.useState(false);

  const togglePlatform = (id: string) => {
    if (selectedPlatforms.length === 0) {
      onPlatformsChange(PLATFORM_OPTIONS.map((p) => p.id).filter((pid) => pid !== id));
    } else if (selectedPlatforms.includes(id)) {
      const next = selectedPlatforms.filter((p) => p !== id);
      onPlatformsChange(next.length === 0 ? [] : next);
    } else {
      onPlatformsChange([...selectedPlatforms, id]);
    }
  };
  const isSelected = (id: string) => selectedPlatforms.length === 0 || selectedPlatforms.includes(id);

  return (
    <header
      className="sticky top-0 z-20 h-16 flex items-center justify-between px-6 rounded-b-2xl border-b border-slate-200/80"
      style={{
        background: 'rgba(255,255,255,0.85)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
      }}
    >
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2 px-3 py-2 bg-white/80 rounded-xl border border-slate-200/80">
          <Calendar className="w-4 h-4 text-slate-500" />
          <input
            type="date"
            value={dateStart}
            onChange={(e) => onDateChange(e.target.value, dateEnd)}
            className="text-sm text-slate-700 bg-transparent border-0 focus:ring-0 p-0 w-[7rem]"
          />
          <span className="text-slate-400">to</span>
          <input
            type="date"
            value={dateEnd}
            onChange={(e) => onDateChange(dateStart, e.target.value)}
            className="text-sm text-slate-700 bg-transparent border-0 focus:ring-0 p-0 w-[7rem]"
          />
        </div>
        <div className="relative">
          <button
            type="button"
            onClick={() => setPlatformDropdownOpen((o) => !o)}
            className="flex items-center gap-2 px-3 py-2 bg-white/80 rounded-xl border border-slate-200/80 text-sm text-slate-700 hover:bg-white"
          >
            Platforms
            <ChevronDown className="w-4 h-4" />
          </button>
          {platformDropdownOpen && (
            <>
              <div className="fixed inset-0 z-[100]" onClick={() => setPlatformDropdownOpen(false)} />
              <div className="absolute top-full left-0 mt-1 py-2 w-48 bg-white rounded-xl border border-slate-200 shadow-lg z-[101]">
                {PLATFORM_OPTIONS.map((p) => (
                  <label key={p.id} className="flex items-center gap-2 px-3 py-2 hover:bg-slate-50 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isSelected(p.id)}
                      onChange={() => togglePlatform(p.id)}
                      className="rounded border-slate-300"
                    />
                    <span className="text-sm text-slate-700">{p.label}</span>
                  </label>
                ))}
              </div>
            </>
          )}
        </div>
        <label className="flex items-center gap-2 px-3 py-2 bg-white/80 rounded-xl border border-slate-200/80 cursor-pointer">
          <input
            type="checkbox"
            checked={compareEnabled}
            onChange={(e) => onCompareToggle(e.target.checked)}
            className="rounded border-slate-300"
          />
          <span className="text-sm text-slate-700">Compare period</span>
        </label>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onRefresh}
          className="p-2 rounded-xl border border-slate-200/80 text-slate-600 hover:bg-slate-50 hover:text-slate-800"
          title="Refresh"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
        <div className="flex rounded-xl overflow-hidden border border-slate-200/80">
          <button
            type="button"
            onClick={() => onExport('csv')}
            className="px-3 py-2 text-sm text-slate-700 bg-white/80 hover:bg-slate-50 border-r border-slate-200/80"
          >
            CSV
          </button>
          <button
            type="button"
            onClick={() => onExport('pdf')}
            className="px-3 py-2 text-sm text-slate-700 bg-white/80 hover:bg-slate-50"
          >
            PDF
          </button>
        </div>
      </div>
    </header>
  );
}
