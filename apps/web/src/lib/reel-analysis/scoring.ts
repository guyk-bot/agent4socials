/**
 * Rule-based scoring and label for short-form video.
 * Weights: Hook 25%, First 3s 20%, Pacing 15%, Length 10%, Caption 10%, CTA 10%, Technical 10%.
 */

import type { ReelScoreLabel, ShortVideoMetadata } from './types';

const PREFERRED_ASPECT = 9 / 16;
const MIN_DURATION_SEC = 5;
const MAX_DURATION_SEC = 90;

export function getScoreLabel(score: number): ReelScoreLabel {
  if (score >= 85) return 'Strong Potential';
  if (score >= 70) return 'Promising';
  if (score >= 50) return 'Fair';
  return 'Needs Work';
}

/** Aspect ratio score 0-100. 9:16 = 100; other vertical gets partial; horizontal gets low. */
export function scoreAspectRatio(width: number, height: number): { score: number; reason: string } {
  if (width <= 0 || height <= 0) return { score: 0, reason: 'Invalid dimensions.' };
  const ratio = width / height;
  const targetRatio = PREFERRED_ASPECT;
  const diff = Math.abs(ratio - targetRatio);
  if (diff < 0.05) return { score: 100, reason: 'Vertical 9:16 format is ideal for reels and shorts.' };
  if (ratio < 0.6) return { score: 85, reason: 'Portrait format works well for short-form.' };
  if (ratio < 0.8) return { score: 70, reason: 'Slightly off 9:16; consider cropping to vertical.' };
  if (ratio <= 1.2) return { score: 50, reason: 'Square format is acceptable but vertical performs better for reels.' };
  return { score: 25, reason: 'Landscape is not ideal for reels and shorts; use 9:16 for best performance.' };
}

/** Duration fit 0-100. 5-90 sec = 100; outside range gets lower. */
export function scoreDurationFit(durationSec: number): { score: number; reason: string } {
  if (durationSec >= MIN_DURATION_SEC && durationSec <= MAX_DURATION_SEC) {
    return { score: 100, reason: 'Length is in the ideal 5–90 second range for short-form.' };
  }
  if (durationSec < MIN_DURATION_SEC) {
    return { score: 60, reason: 'Under 5 seconds may feel too short; consider adding a bit more content.' };
  }
  if (durationSec <= 120) {
    return { score: 70, reason: 'Over 90 seconds; shorter reels tend to hold attention better.' };
  }
  return { score: 40, reason: 'Over 2 minutes; consider trimming for short-form retention.' };
}

/**
 * Technical readiness: aspect + duration + optional subtitle/audio hints.
 * Returns 0-100 and a short reason.
 */
export function scoreTechnicalReadiness(metadata: ShortVideoMetadata): { score: number; reason: string } {
  const aspect = scoreAspectRatio(metadata.width, metadata.height);
  const duration = scoreDurationFit(metadata.durationSec);
  let technical = (aspect.score * 0.5) + (duration.score * 0.5);
  if (metadata.hasSubtitles === true) technical = Math.min(100, technical + 10);
  else if (metadata.hasSubtitles === false) technical = Math.max(0, technical - 5);
  const reasons: string[] = [];
  if (aspect.score >= 80) reasons.push('Good format.');
  else reasons.push(aspect.reason);
  if (duration.score >= 80) reasons.push('Good length.');
  else reasons.push(duration.reason);
  if (metadata.hasSubtitles === true) reasons.push('Subtitles detected.');
  return {
    score: Math.round(Math.min(100, technical)),
    reason: reasons.join(' '),
  };
}

/** Weights for overall score (must sum to 1). */
export const REEL_SCORE_WEIGHTS = {
  hookStrength: 0.25,
  first3Seconds: 0.2,
  pacing: 0.15,
  lengthFit: 0.1,
  captionQuality: 0.1,
  ctaStrength: 0.1,
  technicalReadiness: 0.1,
} as const;

/**
 * Compute weighted overall score from sub-scores and technical.
 * All inputs 0-100. Returns 0-100 and label.
 */
export function calculateReelScore(
  scores: {
    hookStrength: number;
    first3Seconds: number;
    pacing: number;
    lengthFit: number;
    captionQuality: number;
    ctaStrength: number;
    technicalReadiness?: number;
  }
): { overallScore: number; label: ReelScoreLabel } {
  const tech = scores.technicalReadiness ?? 70;
  const overall =
    scores.hookStrength * REEL_SCORE_WEIGHTS.hookStrength +
    scores.first3Seconds * REEL_SCORE_WEIGHTS.first3Seconds +
    scores.pacing * REEL_SCORE_WEIGHTS.pacing +
    scores.lengthFit * REEL_SCORE_WEIGHTS.lengthFit +
    scores.captionQuality * REEL_SCORE_WEIGHTS.captionQuality +
    scores.ctaStrength * REEL_SCORE_WEIGHTS.ctaStrength +
    tech * REEL_SCORE_WEIGHTS.technicalReadiness;
  const overallScore = Math.round(Math.min(100, Math.max(0, overall)));
  return { overallScore, label: getScoreLabel(overallScore) };
}

/** Build risk factors from metadata and AI-reported risks. */
export function buildRiskFactors(
  metadata: ShortVideoMetadata,
  aiRiskFactors: string[]
): string[] {
  const risks: string[] = [];
  const aspect = scoreAspectRatio(metadata.width, metadata.height);
  if (aspect.score < 50) risks.push('Not vertical');
  const duration = scoreDurationFit(metadata.durationSec);
  if (duration.score < 70) risks.push('Too long for reels');
  if (metadata.hasSubtitles === false) risks.push('No subtitles detected');
  for (const r of aiRiskFactors) {
    const lower = r.toLowerCase();
    if (!risks.some((x) => x.toLowerCase() === lower)) risks.push(r);
  }
  return risks;
}

export function validateShortVideoMetadata(metadata: ShortVideoMetadata): { valid: boolean; warnings: string[] } {
  const warnings: string[] = [];
  const aspect = scoreAspectRatio(metadata.width, metadata.height);
  if (aspect.score < 70) warnings.push('Video is not vertical (9:16 is preferred for reels and shorts).');
  if (metadata.durationSec > MAX_DURATION_SEC) warnings.push('Video is longer than 90 seconds; shorter clips often perform better.');
  if (metadata.durationSec < MIN_DURATION_SEC) warnings.push('Video is under 5 seconds; consider a bit more content.');
  return { valid: true, warnings };
}
