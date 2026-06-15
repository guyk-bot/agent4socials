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
    '- Threads also supports image or video from chat when the user attached media: use prepare_platform_post_drafts or open_composer_draft with mediaUrls.',
    '- Text-only post (Threads, Twitter/X, Facebook, LinkedIn): if only one platform is connected, use it automatically. Do not ask which platform or ask for a caption. Write a ready-to-publish caption from brand context and call prepare_platform_post_drafts with postType text immediately.',
    '- Never use placeholder captions like "Your text-only thread post here". Write real copy the user can publish.',
    `- Media required (image or video): ${mediaRequiredPlatformsSummary()}.`,
    '- When the user attaches media and asks to post (especially Threads), call open_composer_draft with mediaUrls from the attachment URLs, or prepare_platform_post_drafts for text-only platforms.',
    '- open_composer_draft opens inline Composer in chat (same options as full Composer: platforms, caption, media, schedule, publish).',
    '- When the user asks to post on all platforms without media, call prepare_platform_post_drafts for text-only platforms only.',
    '- For Instagram/TikTok/YouTube/Pinterest with media, use open_composer_draft with mediaUrls so inline Composer is pre-filled.',
    '- You cannot publish posts yourself. Previews appear as cards; the user must click Allow / publish on each card, or publish from inline Composer.',
    '- Never say a post was published unless the user approved via a preview card or Composer.',
    '- If the user says "do it", "yes", or "publish" after previews are shown, tell them to review the preview cards or inline Composer and click publish.',
    '- Always pass platform on each draft so the UI shows the target platform.',
  ].join('\n');
}
