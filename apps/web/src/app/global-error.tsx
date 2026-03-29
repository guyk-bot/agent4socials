'use client';

import { useEffect } from 'react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Global error:', error);
  }, [error]);

  return (
    <html lang="en">
      <body style={{ fontFamily: 'system-ui', padding: '2rem', background: '#f9fafb' }}>
        <div style={{ maxWidth: '42rem', margin: '0 auto' }}>
          <h1 style={{ color: '#b91c1c', fontSize: '1.25rem', fontWeight: 600 }}>
            Application error
          </h1>
          <pre
            style={{
              marginTop: '1rem',
              padding: '1rem',
              background: '#fef2f2',
              border: '1px solid #fecaca',
              borderRadius: '0.5rem',
              fontSize: '0.875rem',
              color: '#991b1b',
              overflow: 'auto',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}
          >
            {error.message}
          </pre>
          {error.digest && (
            <p style={{ marginTop: '0.5rem', fontSize: '0.75rem', color: '#6b7280' }}>
              Digest: {error.digest}
            </p>
          )}
          <div style={{ marginTop: '1.5rem', display: 'flex', gap: '0.75rem' }}>
            <button
              onClick={reset}
              style={{
                padding: '0.5rem 1rem',
                borderRadius: '0.5rem',
                background: '#4f46e5',
                color: 'white',
                fontWeight: 500,
                border: 'none',
                cursor: 'pointer',
              }}
            >
              Try again
            </button>
            <a href="/" style={{ fontSize: '0.875rem', color: '#4f46e5' }}>
              Go home
            </a>
          </div>
        </div>
      </body>
    </html>
  );
}
