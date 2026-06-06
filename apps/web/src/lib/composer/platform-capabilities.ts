/** Shared composer / iZop AI posting rules (text-only vs media required). */

export const COMPOSER_PLATFORM_LABELS: Record<string, string> = {
  INSTAGRAM: 'Instagram',
  TIKTOK: 'TikTok',
  YOUTUBE: 'YouTube',
  FACEBOOK: 'Facebook',
  TWITTER: 'Twitter/X',
  LINKEDIN: 'LinkedIn',
  PINTEREST: 'Pinterest',
  THREADS: 'Threads',
};

/** Caption-only posts (no image or video attached). Matches Composer "Text" format. */
export const TEXT_ONLY_COMPOSER_PLATFORMS = ['TWITTER', 'FACEBOOK', 'LINKEDIN', 'THREADS'] as const;

export type TextOnlyComposerPlatform = (typeof TEXT_ONLY_COMPOSER_PLATFORMS)[number];

/** These platforms always need media in Composer (cannot publish text-only from chat). */
export const MEDIA_REQUIRED_COMPOSER_PLATFORMS = [
  'INSTAGRAM',
  'TIKTOK',
  'YOUTUBE',
  'PINTEREST',
] as const;

export function platformLabel(platform: string): string {
  return COMPOSER_PLATFORM_LABELS[platform.toUpperCase()] ?? platform;
}

export function platformSupportsTextOnly(platform: string): boolean {
  return TEXT_ONLY_COMPOSER_PLATFORMS.includes(
    platform.toUpperCase() as TextOnlyComposerPlatform
  );
}

export function platformRequiresMedia(platform: string): boolean {
  return MEDIA_REQUIRED_COMPOSER_PLATFORMS.includes(
    platform.toUpperCase() as (typeof MEDIA_REQUIRED_COMPOSER_PLATFORMS)[number]
  );
}

export function textOnlyPlatformsSummary(): string {
  return TEXT_ONLY_COMPOSER_PLATFORMS.map((p) => platformLabel(p)).join(', ');
}

export function mediaRequiredPlatformsSummary(): string {
  return MEDIA_REQUIRED_COMPOSER_PLATFORMS.map((p) => platformLabel(p)).join(', ');
}

export function postingCapabilitiesPromptBlock(): string {
  return [
    'Posting capabilities (critical):',
    `- Text-only (caption, no media) can be published from chat or Composer on: ${textOnlyPlatformsSummary()}.`,
    `- Media required (image or video in Composer): ${mediaRequiredPlatformsSummary()}.`,
    '- When the user asks for variations without attaching media, only prepare text drafts for text-only platforms.',
    '- Say clearly which platforms need media and that those drafts must be finished in Composer.',
    '- Always pass platform on each draft so the UI shows the target platform.',
  ].join('\n');
}
