'use client';

import { useEffect } from 'react';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('App error:', error);
  }, [error]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-6 bg-gray-50">
      <h1 className="text-xl font-semibold text-red-700">Something went wrong</h1>
      <pre className="max-w-2xl w-full p-4 rounded-lg bg-red-50 border border-red-200 text-sm text-red-900 overflow-auto whitespace-pre-wrap">
        {error.message}
      </pre>
      {error.digest && (
        <p className="text-xs text-gray-500">Digest: {error.digest}</p>
      )}
      <button
        onClick={reset}
        className="px-4 py-2 rounded-lg bg-indigo-600 text-white font-medium hover:bg-indigo-700"
      >
        Try again
      </button>
      <a href="/" className="text-sm text-indigo-600 hover:underline">Go home</a>
    </div>
  );
}
