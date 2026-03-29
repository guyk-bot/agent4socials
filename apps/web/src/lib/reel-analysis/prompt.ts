/**
 * Build the system and user prompt for AI reel analysis.
 * AI returns JSON only; we do not send the raw video.
 */

import type { ShortVideoMetadata } from './types';

const PLATFORM_HINTS: Record<string, string> = {
  instagram: 'Instagram Reels: strong visual hook, clear CTA, captions help. 15-90 sec ideal.',
  tiktok: 'TikTok: faster hook, punchier caption, trend-aware. First second is critical.',
  youtube: 'YouTube Shorts: clearer payoff, stronger first line, 60 sec max. Thumbnail matters less.',
  facebook: 'Facebook Reels: cleaner CTA, stronger visual opening. Similar to Instagram.',
};

export function generateReelAnalysisPrompt(
  caption: string,
  metadata: ShortVideoMetadata,
  transcript: string | undefined,
  targetPlatform?: string
): { system: string; user: string } {
  const platformHint = targetPlatform ? PLATFORM_HINTS[targetPlatform.toLowerCase()] ?? '' : '';
  const system = `You are an expert at optimizing short-form vertical video (Reels, TikTok, Shorts) for growth. You analyze captions and transcripts to give actionable feedback. Do not guarantee virality or predict exact performance. Output valid JSON only, no markdown or extra text.

Output this exact structure (use double quotes for strings):
{
  "overallScore": <0-100>,
  "label": "<Needs Work | Fair | Promising | Strong Potential>",
  "summary": "<2-3 sentence AI summary of strengths and what to improve>",
  "scores": {
    "hookStrength": { "score": <0-100>, "reason": "<short reason>" },
    "first3Seconds": { "score": <0-100>, "reason": "<short reason>" },
    "pacing": { "score": <0-100>, "reason": "<short reason>" },
    "lengthFit": { "score": <0-100>, "reason": "<short reason>" },
    "captionQuality": { "score": <0-100>, "reason": "<short reason>" },
    "ctaStrength": { "score": <0-100>, "reason": "<short reason>" }
  },
  "recommendations": [ "<actionable tip 1>", "<tip 2>", ... ],
  "riskFactors": [ "<risk 1>", "<risk 2>", ... ],
  "creativeAdvice": {
    "hooks": [ "<suggestion for a stronger hook>", ... ],
    "toneEmotions": [ "<suggestion about tone or emotional delivery>", ... ],
    "vocalsAndSound": [ "<suggestion about vocals, vocal quality, or sound/music>", ... ]
  }
}
Guidelines: overallScore and each score 0-100. Give 3-6 recommendations. riskFactors: only include clear issues (e.g. "No clear CTA", "Weak opening hook", "No subtitles detected", "Caption is too generic"). Do not use viral or guarantee language. Use "Growth Potential" style wording.
For creativeAdvice: give 1-3 concrete suggestions per category when relevant. hooks = how to improve the opening to grab attention. toneEmotions = delivery tone, emotion, energy. vocalsAndSound = voice clarity, vocal quality, background music or sound design. Base these on caption, transcript, and metadata (e.g. duration, hasAudio). If no transcript, infer from context or say "Add a transcript for vocal/sound advice."`;

  const metaDesc = [
    `Duration: ${metadata.durationSec} seconds`,
    `Dimensions: ${metadata.width}×${metadata.height} (aspect ${(metadata.width / metadata.height).toFixed(2)})`,
    metadata.hasAudio === false ? 'No audio detected.' : 'Audio present.',
    metadata.hasSubtitles === true ? 'Subtitles/on-screen text detected.' : metadata.hasSubtitles === false ? 'No subtitles detected.' : '',
    metadata.dynamicFirst3Sec === true ? 'Strong visual change in first 3 seconds.' : metadata.dynamicFirst3Sec === false ? 'Low visual motion in first 3 seconds.' : '',
  ].filter(Boolean).join('\n');

  const userParts = [
    'Analyze this short-form video for pre-publish optimization.',
    platformHint ? `Target platform: ${targetPlatform}. ${platformHint}` : '',
    '\nMetadata:\n' + metaDesc,
    '\nCaption:\n' + (caption || '(No caption provided)'),
    transcript ? '\nTranscript (speech in video):\n' + transcript : '\nNo transcript provided. Base hook/pacing/CTA assessment on caption and best practices for short-form.',
    '\nReturn the JSON object only.',
  ];
  const user = userParts.filter(Boolean).join('\n');

  return { system, user };
}
