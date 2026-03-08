/**
 * Main reel analysis pipeline: merge rule-based technical score with AI JSON.
 * Does not send raw video to the LLM; uses caption + optional transcript + metadata.
 */

import type { ReelAnalysisResult, ReelAnalyzeInput, ReelAnalysisScores } from './types';
import {
  scoreTechnicalReadiness,
  scoreDurationFit,
  calculateReelScore,
  buildRiskFactors,
} from './scoring';
import { generateReelAnalysisPrompt } from './prompt';

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const MODEL = 'openai/gpt-4.1-mini';

export interface AnalyzeReelOptions {
  openRouterApiKey: string;
}

/**
 * Run the full analysis: technical score from metadata, AI from caption/transcript, then merge.
 */
export async function analyzeReel(
  input: ReelAnalyzeInput,
  options: AnalyzeReelOptions
): Promise<ReelAnalysisResult> {
  const technical = scoreTechnicalReadiness(input.metadata);
  const { system, user } = generateReelAnalysisPrompt(
    input.caption,
    input.metadata,
    input.transcript,
    input.targetPlatform
  );

  const res = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${options.openRouterApiKey}`,
      'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL || '',
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      max_tokens: 1600,
      response_format: { type: 'json_object' },
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`AI analysis failed: ${res.status} ${errText}`);
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    error?: { message?: string };
  };
  if (data.error?.message) throw new Error(data.error.message);
  const raw = data.choices?.[0]?.message?.content?.trim() ?? '';

  const parsed = parseAiJson(raw);
  const technicalReadiness = technical.score;

  const scores: ReelAnalysisScores = {
    hookStrength: parsed.scores.hookStrength ?? { score: 70, reason: 'Unable to assess.' },
    first3Seconds: parsed.scores.first3Seconds ?? { score: 70, reason: 'Unable to assess.' },
    pacing: parsed.scores.pacing ?? { score: 70, reason: 'Unable to assess.' },
    lengthFit: parsed.scores.lengthFit ?? { score: scoreDurationFit(input.metadata.durationSec).score, reason: technical.reason },
    captionQuality: parsed.scores.captionQuality ?? { score: 70, reason: 'Unable to assess.' },
    ctaStrength: parsed.scores.ctaStrength ?? { score: 70, reason: 'Unable to assess.' },
  };

  const { overallScore, label } = calculateReelScore({
    hookStrength: scores.hookStrength.score,
    first3Seconds: scores.first3Seconds.score,
    pacing: scores.pacing.score,
    lengthFit: scores.lengthFit.score,
    captionQuality: scores.captionQuality.score,
    ctaStrength: scores.ctaStrength.score,
    technicalReadiness,
  });

  const riskFactors = buildRiskFactors(input.metadata, parsed.riskFactors ?? []);

  return {
    overallScore,
    label: label as ReelAnalysisResult['label'],
    summary: parsed.summary ?? 'Analysis complete. Review sub-scores and recommendations.',
    scores: {
      ...scores,
      visualClarity: parsed.scores.visualClarity,
      subtitlePresence: parsed.scores.subtitlePresence,
    },
    recommendations: Array.isArray(parsed.recommendations) ? parsed.recommendations : [],
    riskFactors,
    creativeAdvice: parsed.creativeAdvice,
  };
}

function parseAiJson(raw: string): {
  overallScore?: number;
  label?: string;
  summary?: string;
  scores: Record<string, { score: number; reason: string }>;
  recommendations?: string[];
  riskFactors?: string[];
  creativeAdvice?: { hooks?: string[]; toneEmotions?: string[]; vocalsAndSound?: string[] };
} {
  const stripped = raw.replace(/^```json\s*/i, '').replace(/\s*```\s*$/i, '').trim();
  try {
    const o = JSON.parse(stripped) as Record<string, unknown>;
    const scores = (o.scores as Record<string, { score?: number; reason?: string }>) ?? {};
    const normalizedScores: Record<string, { score: number; reason: string }> = {};
    for (const [k, v] of Object.entries(scores)) {
      if (v && typeof v === 'object' && typeof (v as { score?: number }).score === 'number') {
        normalizedScores[k] = {
          score: Math.min(100, Math.max(0, (v as { score: number }).score)),
          reason: typeof (v as { reason?: string }).reason === 'string' ? (v as { reason: string }).reason : '',
        };
      }
    }
    const rawAdvice = o.creativeAdvice as Record<string, unknown> | undefined;
    const creativeAdvice =
      rawAdvice && typeof rawAdvice === 'object'
        ? {
            hooks: Array.isArray(rawAdvice.hooks) ? (rawAdvice.hooks as unknown[]).filter((x): x is string => typeof x === 'string') : undefined,
            toneEmotions: Array.isArray(rawAdvice.toneEmotions) ? (rawAdvice.toneEmotions as unknown[]).filter((x): x is string => typeof x === 'string') : undefined,
            vocalsAndSound: Array.isArray(rawAdvice.vocalsAndSound) ? (rawAdvice.vocalsAndSound as unknown[]).filter((x): x is string => typeof x === 'string') : undefined,
          }
        : undefined;
    return {
      overallScore: typeof o.overallScore === 'number' ? o.overallScore : undefined,
      label: typeof o.label === 'string' ? o.label : undefined,
      summary: typeof o.summary === 'string' ? o.summary : undefined,
      scores: normalizedScores,
      recommendations: Array.isArray(o.recommendations)
        ? (o.recommendations as unknown[]).filter((x): x is string => typeof x === 'string')
        : undefined,
      riskFactors: Array.isArray(o.riskFactors)
        ? (o.riskFactors as unknown[]).filter((x): x is string => typeof x === 'string')
        : undefined,
      creativeAdvice,
    };
  } catch {
    return {
      scores: {},
      summary: 'Could not parse AI response. Try again.',
    };
  }
}
