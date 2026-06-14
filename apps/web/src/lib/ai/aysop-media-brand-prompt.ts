/** Concise copy when user uploads media to post without brand context. */
export const MEDIA_BRAND_SETUP_REPLY =
  'Image received. I suggest setting up brand context so I can come up with the best content for you. I can create your brand context by scanning your connected accounts. Choose one of the options below.';

export function userWantsToPostFromMessage(text: string, hasMedia: boolean): boolean {
  if (!hasMedia) return false;
  const t = text.trim();
  if (!t) return true;
  return /\b(post|upload|publish|share|draft|schedule|threads?|instagram|tiktok|facebook|youtube|create)\b/i.test(
    t
  );
}
