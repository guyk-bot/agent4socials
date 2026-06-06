'use client';

import React, { Suspense } from 'react';
import { Loader2 } from 'lucide-react';
import AysopAiWorkspace from '@/components/aysop/AysopAiWorkspace';

function LoadingShell() {
  return (
    <div className="flex items-center justify-center gap-2 h-64 text-neutral-500">
      <Loader2 className="animate-spin" size={22} />
      Loading…
    </div>
  );
}

export default function IzopAIPage() {
  return (
    <Suspense fallback={<LoadingShell />}>
      <AysopAiWorkspace />
    </Suspense>
  );
}
