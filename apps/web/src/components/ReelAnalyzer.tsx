'use client';

import React, { useState, useEffect } from 'react';
import { Loader2, Sparkles, AlertTriangle, ChevronDown, ChevronUp } from 'lucide-react';
import api from '@/lib/api';
import type { ReelAnalysisResult } from '@/lib/reel-analysis/types';

const SUBSCORE_KEYS: { key: keyof ReelAnalysisResult['scores']; label: string }[] = [
  { key: 'hookStrength', label: 'Hook Strength' },
  { key: 'first3Seconds', label: 'First 3 Seconds' },
  { key: 'pacing', label: 'Pacing' },
  { key: 'lengthFit', label: 'Length Fit' },
  { key: 'captionQuality', label: 'Caption Quality' },
  { key: 'ctaStrength', label: 'CTA Strength' },
];

const OPTIONAL_SUBSCORE_KEYS: { key: 'visualClarity' | 'subtitlePresence'; label: string }[] = [
  { key: 'visualClarity', label: 'Visual Clarity' },
  { key: 'subtitlePresence', label: 'Subtitle Presence' },
];

export interface ReelAnalyzerProps {
  /** Public URL of the video (e.g. from R2 or proxy). */
  videoUrl: string;
  /** Caption for the post. */
  caption: string;
  /** Optional: instagram | tiktok | youtube | facebook */
  targetPlatform?: string;
  /** Metadata from video element (required for analysis). */
  metadata: {
    durationSec: number;
    width: number;
    height: number;
    hasAudio?: boolean;
    hasSubtitles?: boolean;
    dynamicFirst3Sec?: boolean;
  };
  /** Optional transcript (if available). */
  transcript?: string;
  /** Proxy URL for video preview if needed (e.g. for CORS). */
  videoPreviewUrl?: string;
  /** Class name for the root container. */
  className?: string;
  /** If true, show only analysis content (no collapsible header). Use on dedicated Reel Analyzer page. */
  standalone?: boolean;
}

export function ReelAnalyzer({
  videoUrl,
  caption,
  targetPlatform,
  metadata,
  transcript,
  videoPreviewUrl,
  className = '',
  standalone = false,
}: ReelAnalyzerProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ReelAnalysisResult | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [expanded, setExpanded] = useState(true);

  useEffect(() => {
    setResult(null);
    setError(null);
    setWarnings([]);
  }, [videoUrl]);

  const runAnalysis = async () => {
    setError(null);
    setResult(null);
    setWarnings([]);
    setLoading(true);
    try {
      const res = await api.post<ReelAnalysisResult & { warnings?: string[] }>('/reels/analyze', {
        videoUrl,
        caption,
        targetPlatform: targetPlatform || undefined,
        metadata: {
          durationSec: metadata.durationSec,
          width: metadata.width,
          height: metadata.height,
          hasAudio: metadata.hasAudio,
          hasSubtitles: metadata.hasSubtitles,
          dynamicFirst3Sec: metadata.dynamicFirst3Sec,
        },
        transcript: transcript || undefined,
      });
      const data = res.data as ReelAnalysisResult & { warnings?: string[] };
      const { warnings: w, ...analysis } = data;
      setResult(analysis);
      if (w?.length) setWarnings(w);
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Analysis failed. Try again.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const displayUrl = videoPreviewUrl || videoUrl;

  const analysisContent = (
    <div className="p-4">
      <p className="text-sm text-neutral-500 mb-3">
        Get a Short Video Score and optimization tips before publishing. This is a pre-publish tool, not a virality predictor.
      </p>

      <div className="flex flex-col lg:flex-row gap-4 items-start">
        {/* Video preview */}
        <div className="w-full lg:w-[min(280px,100%)] shrink-0 rounded-lg overflow-hidden bg-neutral-100 border border-neutral-200 aspect-[9/16] max-h-[320px] lg:max-h-[400px]">
          <video
            src={displayUrl}
            controls
            className="w-full h-full object-contain"
            preload="metadata"
            crossOrigin="anonymous"
          />
        </div>

        {/* Actions + results */}
        <div className="flex-1 min-w-0 w-full">
          {!result && !loading && (
            <button
              type="button"
              onClick={runAnalysis}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 transition-colors"
            >
              <Sparkles size={18} />
              Analyze for growth potential
            </button>
          )}

          {loading && (
            <div className="flex items-center gap-2 text-neutral-500 py-4">
              <Loader2 size={20} className="animate-spin" />
              <span className="text-sm">Analyzing your reel…</span>
            </div>
          )}

          {error && (
            <div className="flex items-start gap-2 mt-2 p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-sm">
              <AlertTriangle size={18} className="shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {warnings.length > 0 && (
            <ul className="mt-2 text-sm text-amber-700 list-disc list-inside">
              {warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          )}

          {result && (
            <div className="mt-4 space-y-4">
              {/* Main card: overall score, label, summary */}
              <div className="rounded-xl border border-neutral-200 bg-neutral-50/50 p-4">
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className="text-3xl font-bold text-neutral-900">{result.overallScore}</span>
                  <span className="text-neutral-500">/ 100</span>
                  <span className="text-sm font-medium text-neutral-600">Short Video Score</span>
                </div>
                <p className="mt-1 text-sm font-medium text-indigo-600">{result.label}</p>
                <p className="mt-2 text-sm text-neutral-700 leading-relaxed">{result.summary}</p>
              </div>

              {/* Sub-scores */}
              <div>
                <h4 className="text-sm font-semibold text-neutral-700 mb-2">Performance breakdown</h4>
                <div className="grid gap-3 sm:grid-cols-2">
                  {SUBSCORE_KEYS.map(({ key, label }) => {
                    const sub = result.scores[key];
                    if (!sub || typeof sub.score !== 'number') return null;
                    return (
                      <div key={key} className="rounded-lg border border-neutral-200 p-3 bg-white">
                        <div className="flex justify-between items-baseline gap-2">
                          <span className="text-sm font-medium text-neutral-800">{label}</span>
                          <span className="text-sm font-semibold text-neutral-700">{sub.score}/100</span>
                        </div>
                        <div className="h-1.5 mt-1.5 rounded-full bg-neutral-200 overflow-hidden">
                          <div
                            className="h-full rounded-full bg-indigo-500 transition-all"
                            style={{ width: `${Math.min(100, sub.score)}%` }}
                          />
                        </div>
                        {sub.reason && <p className="text-xs text-neutral-500 mt-1">{sub.reason}</p>}
                      </div>
                    );
                  })}
                  {OPTIONAL_SUBSCORE_KEYS.map(({ key, label }) => {
                    const sub = result.scores[key];
                    if (!sub || typeof sub.score !== 'number') return null;
                    return (
                      <div key={key} className="rounded-lg border border-neutral-200 p-3 bg-white">
                        <div className="flex justify-between items-baseline gap-2">
                          <span className="text-sm font-medium text-neutral-800">{label}</span>
                          <span className="text-sm font-semibold text-neutral-700">{sub.score}/100</span>
                        </div>
                        <div className="h-1.5 mt-1.5 rounded-full bg-neutral-200 overflow-hidden">
                          <div
                            className="h-full rounded-full bg-indigo-500 transition-all"
                            style={{ width: `${Math.min(100, sub.score)}%` }}
                          />
                        </div>
                        {sub.reason && <p className="text-xs text-neutral-500 mt-1">{sub.reason}</p>}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Optimization tips */}
              {result.recommendations.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold text-neutral-700 mb-2">Optimization tips</h4>
                  <ul className="list-disc list-inside text-sm text-neutral-700 space-y-1">
                    {result.recommendations.map((rec, i) => (
                      <li key={i}>{rec}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Risk factors */}
              {result.riskFactors.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold text-neutral-700 mb-2">What to improve before publishing</h4>
                  <div className="flex flex-wrap gap-2">
                    {result.riskFactors.map((risk, i) => (
                      <span
                        key={i}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-amber-50 border border-amber-200 text-amber-800 text-xs font-medium"
                      >
                        <AlertTriangle size={12} />
                        {risk}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <button
                type="button"
                onClick={runAnalysis}
                className="text-sm text-indigo-600 hover:text-indigo-700 font-medium"
              >
                Run analysis again
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  if (standalone) {
    return (
      <div className={`rounded-xl border border-neutral-200 bg-white overflow-hidden ${className}`}>
        {analysisContent}
      </div>
    );
  }

  return (
    <div className={`rounded-xl border border-neutral-200 bg-white overflow-hidden ${className}`}>
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="w-full flex items-center justify-between gap-2 px-4 py-3 text-left border-b border-neutral-100 bg-neutral-50/50 hover:bg-neutral-50 transition-colors"
      >
        <span className="font-medium text-neutral-800">Analyze Reel Before Posting</span>
        {expanded ? <ChevronUp size={20} className="text-neutral-400" /> : <ChevronDown size={20} className="text-neutral-400" />}
      </button>

      {expanded && analysisContent}
    </div>
  );
}
