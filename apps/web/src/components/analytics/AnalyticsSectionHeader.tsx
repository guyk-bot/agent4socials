'use client';

import React from 'react';

export interface AnalyticsSectionHeaderProps {
  title: string;
  subtitle?: string;
  className?: string;
}

export function AnalyticsSectionHeader({ title, subtitle, className = '' }: AnalyticsSectionHeaderProps) {
  return (
    <div className={`mb-4 ${className}`}>
      <h3 className="text-lg font-semibold text-[#111827]">{title}</h3>
      {subtitle && <p className="text-[13px] text-[#6b7280] mt-0.5">{subtitle}</p>}
    </div>
  );
}
