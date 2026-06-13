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
    default:
      return null;
  }
}
