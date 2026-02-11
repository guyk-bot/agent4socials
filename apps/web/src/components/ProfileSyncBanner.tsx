'use client';

import React from 'react';

const STORAGE_STATUS = 'profile_sync_status';
const STORAGE_ERROR = 'profile_sync_error';

export default function ProfileSyncBanner() {
  const [status, setStatus] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    const s = sessionStorage.getItem(STORAGE_STATUS);
    const e = sessionStorage.getItem(STORAGE_ERROR);
    if (s === 'skipped' || s === 'failed') {
      setStatus(s);
      setError(e);
    }
  }, []);

  const dismiss = () => {
    sessionStorage.removeItem(STORAGE_STATUS);
    sessionStorage.removeItem(STORAGE_ERROR);
    setStatus(null);
    setError(null);
  };

  if (!status) return null;

  const isSkipped = status === 'skipped';
  const title = isSkipped
    ? 'Profile sync skipped (no database configured)'
    : 'Profile sync failed';
  const detail = isSkipped
    ? 'Set SUPABASE_SERVICE_ROLE_KEY in Vercel (web project) and run the Supabase migration (user_profiles table), or set DATABASE_URL for Prisma. Then redeploy.'
    : error || 'Check Vercel logs for [Profile API].';

  return (
    <div
      role="alert"
      className="mb-4 flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-900"
    >
      <div className="flex-1 min-w-0">
        <p className="font-medium">{title}</p>
        <p className="mt-0.5 text-sm text-amber-800">{detail}</p>
      </div>
      <button
        type="button"
        onClick={dismiss}
        className="shrink-0 rounded px-2 py-1 text-sm font-medium text-amber-700 hover:bg-amber-100"
      >
        Dismiss
      </button>
    </div>
  );
}
