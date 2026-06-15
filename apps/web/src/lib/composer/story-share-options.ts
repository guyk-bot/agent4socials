export type StoryShareEligibility = {
  eligible: boolean;
  hint: string | null;
};

export function threadsInstagramStoryEligible(args: {
  platform: string;
  mediaType: string;
  hasMedia: boolean;
}): StoryShareEligibility {
  if (args.platform.toUpperCase() !== 'THREADS') {
    return { eligible: false, hint: null };
  }
  if (args.mediaType === 'text') {
    return {
      eligible: false,
      hint: 'Text-only Threads posts cannot be shared to Instagram Story.',
    };
  }
  if (args.mediaType === 'story') {
    return {
      eligible: false,
      hint: 'Story format is for Instagram or Facebook Stories. Use photo or video for Threads plus Instagram Story.',
    };
  }
  if (!args.hasMedia) {
    return { eligible: false, hint: 'Add photo or video to enable Instagram Story sharing.' };
  }
  return { eligible: true, hint: null };
}

export function metaAlsoStoryEligible(args: {
  platform: string;
  mediaType: string;
  hasMedia: boolean;
}): StoryShareEligibility {
  const platform = args.platform.toUpperCase();
  if (platform !== 'INSTAGRAM' && platform !== 'FACEBOOK') {
    return { eligible: false, hint: null };
  }
  if (args.mediaType === 'story') {
    return {
      eligible: false,
      hint: 'This post is already a Story. Use photo, reel, or video to post to feed and Story.',
    };
  }
  if (args.mediaType === 'text') {
    return {
      eligible: false,
      hint: 'Add photo or video to also post to Story.',
    };
  }
  if (!args.hasMedia) {
    return { eligible: false, hint: 'Add photo or video to enable Story sharing.' };
  }
  return { eligible: true, hint: null };
}

export function metaAlsoStoryLabel(platform: string): string {
  const p = platform.toUpperCase();
  if (p === 'FACEBOOK') return 'Also post to Facebook Story';
  if (p === 'INSTAGRAM') return 'Also post to Instagram Story';
  return 'Also post to Story';
}

export function metaAlsoStoryDescription(platform: string): string {
  const p = platform.toUpperCase();
  if (p === 'FACEBOOK') {
    return 'Publishes your Facebook feed post first, then shares the same media to your Page Story tray.';
  }
  if (p === 'INSTAGRAM') {
    return 'Publishes your Instagram feed post first, then shares the same media to your Story ring.';
  }
  return 'Publishes your feed post first, then shares the same media to Story.';
}

export const THREADS_INSTAGRAM_STORY_LABEL = 'Also share to Instagram Story';

export const THREADS_INSTAGRAM_STORY_DESCRIPTION =
  'Uses the Threads threads_share_to_instagram permission. Your Instagram account must be linked in the Threads app (Settings), not in iZop. Reconnect Threads after adding this scope.';
