'use client';

import React, { useEffect } from 'react';
import { useSelectedAccount } from '@/context/SelectedAccountContext';
import { SummaryDashboard } from '@/components/dashboard/summary';

export default function SummaryPage() {
  const ctx = useSelectedAccount();
  useEffect(() => {
    ctx?.clearSelection?.();
  }, [ctx?.clearSelection]);

  return (
    <div className="bg-[#F8FAFC] min-h-full -m-6 md:-m-8 p-6 md:p-8">
      <SummaryDashboard />
    </div>
  );
}
