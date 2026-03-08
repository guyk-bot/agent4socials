/**
 * Types for Short Video / Reel Analyzer.
 * Product-safe wording: Growth Potential, Optimization Tips, Performance Score.
 */

export type ReelScoreLabel = 'Needs Work' | 'Fair' | 'Promising' | 'Strong Potential';

export interface ReelSubScore {
  score: number;
  reason: string;
}

export interface ReelAnalysisScores {
  hookStrength: ReelSubScore;
  first3Seconds: ReelSubScore;
  pacing: ReelSubScore;
  lengthFit: ReelSubScore;
  captionQuality: ReelSubScore;
  ctaStrength: ReelSubScore;
  /** Optional: technical / visual */
  visualClarity?: ReelSubScore;
  subtitlePresence?: ReelSubScore;
}

export interface ReelAnalysisResult {
  overallScore: number;
  label: ReelScoreLabel;
  summary: string;
  scores: ReelAnalysisScores;
  recommendations: string[];
  riskFactors: string[];
}

/** Client or server-provided metadata for a short video. */
export interface ShortVideoMetadata {
  durationSec: number;
  width: number;
  height: number;
  /** Optional: file size in bytes */
  fileSizeBytes?: number;
  /** Whether audio track appears to exist */
  hasAudio?: boolean;
  /** Estimated scene changes (optional, from server analysis). */
  sceneChangeCount?: number;
  /** Subtitle/on-screen text detected (optional). */
  hasSubtitles?: boolean;
  /** Strong visual change in first 3 seconds (optional). */
  dynamicFirst3Sec?: boolean;
}

/** Input for analysis: video reference + caption + optional platform. */
export interface ReelAnalyzeInput {
  /** Public URL of the video (for optional server-side transcription). */
  videoUrl: string;
  /** Caption/copy for the post. */
  caption: string;
  /** Optional target platform for platform-specific tips. */
  targetPlatform?: 'instagram' | 'tiktok' | 'youtube' | 'facebook';
  /** Client-extracted metadata (duration, dimensions). */
  metadata: ShortVideoMetadata;
  /** Optional transcript (if available from client or future transcription). */
  transcript?: string;
}
