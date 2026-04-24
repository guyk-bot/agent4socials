'use client';

import React, { useState, useEffect } from 'react';
import { Loader2, Sparkles, AlertTriangle, ChevronDown, ChevronUp, Zap, Heart, Mic } from 'lucide-react';
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
  /** Caption for the post (optional; omit for video-only analysis). */
  caption?: string;
  /** Optional: instagram | tiktok | youtube | facebook (only used when caption is provided, e.g. in Composer). */
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
        caption: caption ?? '',
        ...(targetPlatform ? { targetPlatform } : {}),
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
    <div className="p-5 sm:p-6">
      <p className="text-sm text-neutral-500 mb-4">
        Get a Short Video Score and optimization tips before publishing. This is a pre-publish tool, not a virality predictor.
      </p>

      <div className="flex flex-col lg:flex-row gap-6 items-start">
        {/* Video preview */}
        <div className="w-full lg:w-[min(280px,100%)] shrink-0 rounded-xl overflow-hidden bg-neutral-100 border border-neutral-200 aspect-[9/16] max-h-[320px] lg:max-h-[400px] shadow-inner">
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
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-orange-600 text-white text-sm font-medium hover:bg-orange-700 transition-colors shadow-sm"
            >
              <Sparkles size={18} />
              Analyze for growth potential
            </button>
          )}

          {loading && (
            <div className="flex items-center gap-2 text-neutral-500 py-5">
              <Loader2 size={20} className="animate-spin" />
              <span className="text-sm">Analyzing your reel…</span>
            </div>
          )}

          {error && (
            <div className="flex items-start gap-2 mt-2 p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-sm">
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
            <div className="mt-5 space-y-5">
              {/* Main card: overall score, label, summary */}
              <div className="rounded-xl border border-neutral-200 bg-gradient-to-br from-neutral-50 to-white p-5 shadow-sm">
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className="text-4xl font-bold text-neutral-900">{result.overallScore}</span>
                  <span className="text-neutral-500">/ 100</span>
                  <span className="text-sm font-medium text-neutral-600 ml-1">Short Video Score</span>
                </div>
                <p className="mt-2 text-sm font-semibold text-orange-600">{result.label}</p>
                <p className="mt-2 text-sm text-neutral-700 leading-relaxed">{result.summary}</p>
              </div>

              {/* Sub-scores */}
              <div>
                <h4 className="text-sm font-semibold text-neutral-800 mb-3">Performance breakdown</h4>
                <div className="grid gap-3 sm:grid-cols-2">
                  {SUBSCORE_KEYS.map(({ key, label }) => {
                    const sub = result.scores[key];
                    if (!sub || typeof sub.score !== 'number') return null;
                    return (
                      <div key={key} className="rounded-xl border border-neutral-200 p-3.5 bg-white shadow-sm">
                        <div className="flex justify-between items-baseline gap-2">
                          <span className="text-sm font-medium text-neutral-800">{label}</span>
                          <span className="text-sm font-semibold text-neutral-700">{sub.score}/100</span>
                        </div>
                        <div className="h-2 mt-2 rounded-full bg-neutral-200 overflow-hidden">
                          <div
                            className="h-full rounded-full bg-orange-500 transition-all"
                            style={{ width: `${Math.min(100, sub.score)}%` }}
                          />
                        </div>
                        {sub.reason && <p className="text-xs text-neutral-500 mt-1.5">{sub.reason}</p>}
                      </div>
                    );
                  })}
                  {OPTIONAL_SUBSCORE_KEYS.map(({ key, label }) => {
                    const sub = result.scores[key];
                    if (!sub || typeof sub.score !== 'number') return null;
                    return (
                      <div key={key} className="rounded-xl border border-neutral-200 p-3.5 bg-white shadow-sm">
                        <div className="flex justify-between items-baseline gap-2">
                          <span className="text-sm font-medium text-neutral-800">{label}</span>
                          <span className="text-sm font-semibold text-neutral-700">{sub.score}/100</span>
                        </div>
                        <div className="h-2 mt-2 rounded-full bg-neutral-200 overflow-hidden">
                          <div
                            className="h-full rounded-full bg-orange-500 transition-all"
                            style={{ width: `${Math.min(100, sub.score)}%` }}
                          />
                        </div>
                        {sub.reason && <p className="text-xs text-neutral-500 mt-1.5">{sub.reason}</p>}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Creative advice: hooks, tone/emotions, vocals & sound */}
              {result.creativeAdvice && (result.creativeAdvice.hooks?.length || result.creativeAdvice.toneEmotions?.length || result.creativeAdvice.vocalsAndSound?.length) ? (
                <div className="space-y-4">
                  <h4 className="text-sm font-semibold text-neutral-800">Suggestions to improve</h4>
                  {result.creativeAdvice.hooks && result.creativeAdvice.hooks.length > 0 && (
                    <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
                      <div className="flex items-center gap-2 mb-2">
                        <Zap size={18} className="text-amber-500" />
                        <span className="text-sm font-medium text-neutral-800">Better hooks</span>
                      </div>
                      <ul className="list-disc list-inside text-sm text-neutral-700 space-y-1">
                        {result.creativeAdvice.hooks.map((s, i) => (
                          <li key={i}>{s}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {result.creativeAdvice.toneEmotions && result.creativeAdvice.toneEmotions.length > 0 && (
                    <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
                      <div className="flex items-center gap-2 mb-2">
                        <Heart size={18} className="text-rose-500" />
                        <span className="text-sm font-medium text-neutral-800">Tone & emotions</span>
                      </div>
                      <ul className="list-disc list-inside text-sm text-neutral-700 space-y-1">
                        {result.creativeAdvice.toneEmotions.map((s, i) => (
                          <li key={i}>{s}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {result.creativeAdvice.vocalsAndSound && result.creativeAdvice.vocalsAndSound.length > 0 && (
                    <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
                      <div className="flex items-center gap-2 mb-2">
                        <Mic size={18} className="text-orange-500" />
                        <span className="text-sm font-medium text-neutral-800">Vocals & sound</span>
                      </div>
                      <ul className="list-disc list-inside text-sm text-neutral-700 space-y-1">
                        {result.creativeAdvice.vocalsAndSound.map((s, i) => (
                          <li key={i}>{s}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              ) : null}

              {/* Optimization tips */}
              {result.recommendations.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold text-neutral-800 mb-2">Optimization tips</h4>
                  <ul className="list-disc list-inside text-sm text-neutral-700 space-y-1.5">
                    {result.recommendations.map((rec, i) => (
                      <li key={i}>{rec}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Risk factors */}
              {result.riskFactors.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold text-neutral-800 mb-2">What to improve before publishing</h4>
                  <div className="flex flex-wrap gap-2">
                    {result.riskFactors.map((risk, i) => (
                      <span
                        key={i}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-xs font-medium"
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
                className="text-sm text-orange-600 hover:text-orange-700 font-medium"
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
