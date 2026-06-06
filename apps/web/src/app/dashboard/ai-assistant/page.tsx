'use client';

import React from 'react';
import { Sparkles } from 'lucide-react';
import BrandContextForm from '@/components/brand-context/BrandContextForm';

export default function AIAssistantPage() {
  return (
    <div className="w-full min-h-[calc(100vh-5.5rem)] flex flex-col -mx-8 -my-8 px-8 py-8">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Sparkles size={28} className="text-[var(--button)]" />
            AI Writing Assistant
          </h1>
        </div>
      </div>

      <BrandContextForm variant="page" />
    </div>
  );
}
