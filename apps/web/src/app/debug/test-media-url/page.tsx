'use client';

import { useState } from 'react';

export default function TestMediaUrlPage() {
  const [mediaUrl, setMediaUrl] = useState('');
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const testUrl = async () => {
    if (!mediaUrl.trim()) return;
    
    setLoading(true);
    try {
      const response = await fetch('/api/debug/test-media-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mediaUrl: mediaUrl.trim() }),
      });
      const data = await response.json();
      setResult(data);
    } catch (error) {
      setResult({ error: (error as Error)?.message || 'Request failed' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 mb-8">
          Media URL Accessibility Test
        </h1>
        <p className="text-gray-600 mb-6">
          Test if media URLs are accessible to Meta/Facebook servers for Threads publishing.
        </p>
        
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Media URL to Test:
          </label>
          <div className="flex gap-3">
            <input
              type="url"
              value={mediaUrl}
              onChange={(e) => setMediaUrl(e.target.value)}
              placeholder="https://example.com/image.jpg or /api/media/serve/..."
              className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              onClick={testUrl}
              disabled={loading || !mediaUrl.trim()}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
            >
              {loading ? 'Testing...' : 'Test URL'}
            </button>
          </div>
        </div>

        {result && (
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Test Results</h2>
            
            {result.error ? (
              <div className="bg-red-50 border border-red-200 rounded-md p-4">
                <p className="text-red-800 font-medium">Error:</p>
                <p className="text-red-600">{result.error}</p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <h3 className="font-medium text-gray-700 mb-2">URL Resolution</h3>
                    <div className="bg-gray-50 rounded-md p-3 text-sm">
                      <p><strong>Original:</strong> {result.original}</p>
                      <p><strong>Resolved:</strong> {result.resolved}</p>
                      <p><strong>Changed:</strong> {result.changed ? '✅ Yes' : '❌ No'}</p>
                      <p><strong>Is Direct:</strong> {result.isDirect ? '✅ Yes' : '❌ No'}</p>
                    </div>
                  </div>
                  
                  <div>
                    <h3 className="font-medium text-gray-700 mb-2">Accessibility</h3>
                    <div className="bg-gray-50 rounded-md p-3 text-sm">
                      <p><strong>Accessible:</strong> {result.accessibility.accessible ? '✅ Yes' : '❌ No'}</p>
                      <p><strong>HTTP Status:</strong> {result.accessibility.status}</p>
                      {result.accessibility.error && (
                        <p><strong>Error:</strong> {result.accessibility.error}</p>
                      )}
                    </div>
                  </div>
                  
                  <div>
                    <h3 className="font-medium text-gray-700 mb-2">URL Analysis</h3>
                    <div className="bg-gray-50 rounded-md p-3 text-sm">
                      <p><strong>HTTPS:</strong> {result.urlAnalysis.isHttps ? '✅ Yes' : '❌ No'}</p>
                      <p><strong>Direct Storage:</strong> {result.urlAnalysis.isDirectStorage ? '✅ Yes' : '❌ No'}</p>
                      <p><strong>Host:</strong> {result.urlAnalysis.host}</p>
                    </div>
                  </div>
                  
                  <div>
                    <h3 className="font-medium text-gray-700 mb-2">Quick Actions</h3>
                    <div className="space-y-2">
                      <a
                        href={result.resolved}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-block px-3 py-1 bg-blue-100 text-blue-700 rounded-md text-sm hover:bg-blue-200"
                      >
                        Open URL ↗
                      </a>
                      <button
                        onClick={() => navigator.clipboard.writeText(result.resolved)}
                        className="inline-block px-3 py-1 bg-gray-100 text-gray-700 rounded-md text-sm hover:bg-gray-200 ml-2"
                      >
                        Copy URL
                      </button>
                    </div>
                  </div>
                </div>
                
                <div className="mt-6 p-4 border rounded-md">
                  <h3 className="font-medium text-gray-700 mb-2">Recommendation</h3>
                  <p className="text-gray-800">{result.recommendation}</p>
                </div>
              </div>
            )}
          </div>
        )}
        
        <div className="mt-8 text-sm text-gray-500">
          <p><strong>How to use:</strong> Enter any media URL (from your app or external) to test if it&apos;s accessible to Meta&apos;s servers.</p>
          <p><strong>For Threads:</strong> URLs must be publicly accessible, HTTPS, and ideally direct storage links (R2, S3, etc.)</p>
        </div>
      </div>
    </div>
  );
}