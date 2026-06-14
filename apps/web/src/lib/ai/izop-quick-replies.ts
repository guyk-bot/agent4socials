/** User message sent when the user taps an in-chat action button. */
export function quickReplyMessageForAction(action: string): string | null {
  switch (action) {
    case 'brand_setup_start':
    case 'brand_setup_from_media':
      return 'Set up brand context';
    case 'brand_setup_skip':
      return 'Continue without brand context';
    case 'create_post_only':
      return 'Just create this post';
    case 'resume_pending_post':
      return "Let's upload";
    default:
      return null;
  }
}

export const IZOP_QUICK_REPLY_MESSAGES = [
  'Set up brand context',
  'Continue without brand context',
  'Continue without setup',
  'Just create this post',
  "Let's upload",
  "Let's just upload the post",
] as const;

export function isIzopQuickReplyMessage(text: string): boolean {
  return (IZOP_QUICK_REPLY_MESSAGES as readonly string[]).includes(text.trim());
}
