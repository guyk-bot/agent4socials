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
    `- Text-only (caption, no media) preview + publish from chat: ${textOnlyPlatformsSummary()}.`,
    `- Media required (image or video): ${mediaRequiredPlatformsSummary()}.`,
    '- When the user asks to post on all platforms without media, call prepare_platform_post_drafts for text-only platforms only.',
    '- Do NOT call open_composer_draft or set allowComposerDrafts unless the user explicitly asks for Composer or a draft there.',
    '- When opening Composer, use open_composer_draft with platforms array so Instagram/TikTok/etc. are pre-selected with caption and photo format ready for upload.',
    '- For media platforms, explain they need media and offer Composer as an option. Wait for the user to accept before creating Composer drafts.',
    '- You cannot publish posts yourself. Previews appear as cards; the user must click Approve & publish on each card.',
    '- Never say a post was published, sent, or posted unless the user already approved via the preview card (you have no publish tool).',
    '- If the user says "do it", "yes", or "publish" after previews are shown, tell them to review the preview cards and click Approve & publish. Do not claim you published.',
    '- Always pass platform on each draft so the UI shows the target platform.',
  ].join('\n');
}
