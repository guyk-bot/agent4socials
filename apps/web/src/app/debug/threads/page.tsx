'use client';

import { useState } from 'react';

export default function ThreadsDebugPage() {
  const [accountId, setAccountId] = useState('cmq9pcmt30035hnjbo6oi3zsq'); // Pre-fill with your account ID
  const [testText, setTestText] = useState('');
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const runDebugTest = async () => {
    if (!accountId.trim()) {
      alert('Please enter an account ID');
      return;
    }

    setLoading(true);
    setResult(null);

    try {
      const response = await fetch('/api/debug/threads-publish', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          accountId: accountId.trim(),
          text: testText.trim() || undefined,
        }),
      });

      const data = await response.json();
      setResult(data);
    } catch (error) {
      setResult({
        success: false,
        error: (error as Error)?.message || 'Network error',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-4xl mx-auto px-4">
        <h1 className="text-3xl font-bold text-gray-900 mb-8">
          Threads Publishing Debug Tool
        </h1>

        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">Test Configuration</h2>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Account ID
              </label>
              <input
                type="text"
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Enter Threads account ID"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Test Text (optional)
              </label>
              <textarea
                value={testText}
                onChange={(e) => setTestText(e.target.value)}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Leave empty for default test text"
              />
            </div>

            <button
              onClick={runDebugTest}
              disabled={loading}
              className="bg-blue-600 text-white px-6 py-2 rounded-md hover:bg-blue-700 disabled:bg-blue-300 disabled:cursor-not-allowed"
            >
              {loading ? 'Running Debug Test...' : 'Run Debug Test'}
            </button>
          </div>
        </div>

        {result && (
          <div className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-xl font-semibold mb-4">Debug Results</h2>
            
            {result.success ? (
              <div className="space-y-4">
                {/* Summary */}
                <div className="bg-gray-50 p-4 rounded-md">
                  <h3 className="font-medium mb-2">Summary</h3>
                  <div className="text-sm text-gray-600">
                    <p>Total Steps: {result.summary.totalSteps}</p>
                    <p>Successful: <span className="text-green-600">{result.summary.successfulSteps}</span></p>
                    <p>Failed: <span className="text-red-600">{result.summary.failedSteps}</span></p>
                    {result.summary.firstFailure && (
                      <p className="mt-2 text-red-600">
                        First Failure: {result.summary.firstFailure.step} - {result.summary.firstFailure.error}
                      </p>
                    )}
                  </div>
                </div>

                {/* Detailed Steps */}
                <div>
                  <h3 className="font-medium mb-2">Detailed Steps</h3>
                  <div className="space-y-3">
                    {result.steps.map((step: any, index: number) => (
                      <div
                        key={index}
                        className={`p-4 rounded-md border ${
                          step.success
                            ? 'border-green-200 bg-green-50'
                            : 'border-red-200 bg-red-50'
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
                        
                        {step.data && (
                          <div className="text-sm">
                            <details className="mt-2">
                              <summary className="cursor-pointer text-gray-600 hover:text-gray-800">
                                View Data
                              </summary>
                              <pre className="mt-2 p-2 bg-gray-100 rounded text-xs overflow-x-auto">
                                {JSON.stringify(step.data, null, 2)}
                              </pre>
                            </details>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-red-600">
                <p className="font-medium">Debug test failed:</p>
                <p className="text-sm mt-1">{result.error}</p>
              </div>
            )}

            {/* Raw Result */}
            <details className="mt-6">
              <summary className="cursor-pointer text-gray-600 hover:text-gray-800">
                View Raw Result
              </summary>
              <pre className="mt-2 p-4 bg-gray-100 rounded text-xs overflow-x-auto">
                {JSON.stringify(result, null, 2)}
              </pre>
            </details>
          </div>
        )}
      </div>
    </div>
  );
}