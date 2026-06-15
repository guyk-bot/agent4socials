'use client';

import { useState } from 'react';
import Link from 'next/link';
import api from '@/lib/api';
import { useAuth } from '@/context/AuthContext';

function extractApiError(error: unknown): { message: string; payload: unknown } {
  const ax = error as { response?: { data?: unknown; status?: number }; message?: string };
  const data = ax.response?.data;
  if (data && typeof data === 'object' && 'error' in data && typeof (data as { error?: unknown }).error === 'string') {
    return { message: (data as { error: string }).error, payload: data };
  }
  if (typeof data === 'object' && data !== null) {
    return { message: ax.message || 'Request failed', payload: data };
  }
  return { message: ax.message || 'Network error', payload: { error: ax.message || 'Network error' } };
}

export default function ThreadsDebugPage() {
  const { user, loading } = useAuth();
  const [accountId, setAccountId] = useState('cmq9pcmt30035hnjbo6oi3zsq');
  const [testText, setTestText] = useState('');
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [loadingTest, setLoadingTest] = useState(false);

  const runDebugTest = async () => {
    if (!accountId.trim()) {
      alert('Please enter an account ID');
      return;
    }

    setLoadingTest(true);
    setResult(null);

    try {
      const response = await api.post('/debug/threads-publish', {
        accountId: accountId.trim(),
        text: testText.trim() || undefined,
      });
      setResult(response.data as Record<string, unknown>);
    } catch (error) {
      const { message, payload } = extractApiError(error);
      setResult({
        ...(typeof payload === 'object' && payload !== null ? (payload as Record<string, unknown>) : {}),
        success: false,
        error: message,
      });
    } finally {
      setLoadingTest(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)] flex items-center justify-center">
        Loading…
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)] flex flex-col items-center justify-center gap-4 px-4">
        <p className="text-center text-[var(--muted)]">Sign in to run the Threads publish debug test.</p>
        <Link href="/" className="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white">
          Go to sign in
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)] py-8">
      <div className="max-w-4xl mx-auto px-4">
        <h1 className="text-3xl font-bold mb-2">Threads Publishing Debug Tool</h1>
        <p className="text-sm text-[var(--muted)] mb-8">
          Signed in as {user.email}. This runs token validation and a real text-only Threads publish.
        </p>

        <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">Test Configuration</h2>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">
                Account ID
              </label>
              <input
                type="text"
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
                className="w-full px-3 py-2 border border-[var(--border)] rounded-md bg-[var(--background)] text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/40"
                placeholder="Enter Threads account ID"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">
                Test Text (optional)
              </label>
              <textarea
                value={testText}
                onChange={(e) => setTestText(e.target.value)}
                rows={3}
                className="w-full px-3 py-2 border border-[var(--border)] rounded-md bg-[var(--background)] text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/40"
                placeholder="Leave empty for default test text"
              />
            </div>

            <button
              onClick={runDebugTest}
              disabled={loadingTest}
              className="bg-[var(--primary)] text-white px-6 py-2 rounded-md hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loadingTest ? 'Running Debug Test...' : 'Run Debug Test'}
            </button>
          </div>
        </div>

        {result && (
          <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] p-6">
            <h2 className="text-xl font-semibold mb-4">Debug Results</h2>
            
            {Array.isArray(result.steps) && (result.steps as unknown[]).length > 0 ? (
              <div className="space-y-4">
                <div className="bg-[var(--bg-hover)] p-4 rounded-md">
                  <h3 className="font-medium mb-2">Summary</h3>
                  <div className="text-sm text-[var(--muted)]">
                    <p>Total Steps: {String((result.summary as { totalSteps?: number })?.totalSteps ?? '')}</p>
                    <p>Successful: <span className="text-green-600">{(result.summary as { successfulSteps?: number })?.successfulSteps}</span></p>
                    <p>Failed: <span className="text-red-600">{(result.summary as { failedSteps?: number })?.failedSteps}</span></p>
                    {(result.summary as { firstFailure?: { step?: string; error?: string } })?.firstFailure && (
                      <p className="mt-2 text-red-600">
                        First failure: {(result.summary as { firstFailure: { step: string; error?: string } }).firstFailure.step}
                        {(result.summary as { firstFailure: { error?: string } }).firstFailure.error
                          ? ` - ${(result.summary as { firstFailure: { error: string } }).firstFailure.error}`
                          : ''}
                      </p>
                    )}
                  </div>
                </div>

                <div>
                  <h3 className="font-medium mb-2">Detailed Steps</h3>
                  <div className="space-y-3">
                    {(result.steps as Array<{ step: string; success: boolean; error?: string; data?: unknown }>).map((step, index) => (
                      <div
                        key={index}
                        className={`p-4 rounded-md border ${
                          step.success
                            ? 'border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950/30'
                            : 'border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30'
                        }`}
                      >
                        <div className="flex items-center mb-2">
                          <span
                            className={`w-4 h-4 rounded-full mr-3 ${
                              step.success ? 'bg-green-500' : 'bg-red-500'
                            }`}
                          />
                          <span className="font-medium">{step.step}</span>
                          <span
                            className={`ml-auto text-sm ${
                              step.success ? 'text-green-600' : 'text-red-600'
                            }`}
                          >
                            {step.success ? 'SUCCESS' : 'FAILED'}
                          </span>
                        </div>
                        
                        {step.error && (
                          <div className="text-red-600 text-sm mb-2">
                            Error: {step.error}
                          </div>
                        )}
                        
                        {step.data != null ? (
                          <div className="text-sm">
                            <details className="mt-2">
                              <summary className="cursor-pointer text-[var(--muted)] hover:text-[var(--foreground)]">
                                View Data
                              </summary>
                              <pre className="mt-2 p-2 bg-[var(--bg-hover)] rounded text-xs overflow-x-auto">
                                {JSON.stringify(step.data, null, 2)}
                              </pre>
                            </details>
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-red-600">
                <p className="font-medium">Debug test failed:</p>
                <p className="text-sm mt-1">{String(result.error ?? 'Unknown error')}</p>
              </div>
            )}

            <details className="mt-6">
              <summary className="cursor-pointer text-[var(--muted)] hover:text-[var(--foreground)]">
                View Raw Result
              </summary>
              <pre className="mt-2 p-4 bg-[var(--bg-hover)] rounded text-xs overflow-x-auto">
                {JSON.stringify(result, null, 2)}
              </pre>
            </details>
          </div>
        )}
      </div>
    </div>
  );
}