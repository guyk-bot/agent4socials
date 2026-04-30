/**
 * TikTok Content Posting API: client payload validation and post_info construction.
 * @see https://developers.tiktok.com/doc/content-sharing-guidelines
 * @see https://developers.tiktok.com/doc/content-posting-api-reference-direct-post
 */

export type TikTokCreatorInfoData = {
  creator_avatar_url?: string;
  creator_username?: string;
  creator_nickname?: string;
  privacy_level_options?: string[];
  comment_disabled?: boolean;
  duet_disabled?: boolean;
  stitch_disabled?: boolean;
  max_video_post_duration_sec?: number;
};

/** Stored on Post and sent from the composer modal; must match TikTok audit UX. */
export type TikTokDirectPostPayload = {
  title: string;
  privacyLevel: string;
  allowComment: boolean;
  allowDuet: boolean;
  allowStitch: boolean;
  commercialDisclosureOn: boolean;
  yourBrand: boolean;
  brandedContent: boolean;
  /** User explicitly acknowledged the max duration check shown in composer. */
  maxDurationAcknowledged?: boolean;
  /** User checked the legal consent box for the active declaration variant. */
  userConsentedToPublish: boolean;
  /** Seconds; required for strict max duration enforcement during video posting. */
  videoDurationSec?: number;
};

export const TIKTOK_PRIVACY_LABELS: Record<string, string> = {
  PUBLIC_TO_EVERYONE: 'Public',
  MUTUAL_FOLLOW_FRIENDS: 'Friends',
  FOLLOWER_OF_CREATOR: 'Followers only',
  SELF_ONLY: 'Only me',
};

export type TikTokCreatorInfoApiResult =
  | { ok: true; data: TikTokCreatorInfoData }
  | { ok: false; error: string; blockingCode?: string };

export function parseTikTokCreatorInfoResponse(body: unknown): TikTokCreatorInfoApiResult {
  if (!body || typeof body !== 'object') {
    return { ok: false, error: 'Invalid creator info response.' };
  }
  const root = body as { data?: TikTokCreatorInfoData; error?: { code?: string; message?: string } };
  const err = root.error;
  if (err && err.code && err.code !== 'ok') {
    const code = err.code;
    const msg = (err.message ?? code).slice(0, 400);
    const blocking =
      code === 'spam_risk_too_many_posts' ||
      code === 'spam_risk_user_banned_from_posting' ||
      code === 'reached_active_user_cap';
    return { ok: false, error: msg, blockingCode: blocking ? code : undefined };
  }
  const data = root.data;
  if (!data || typeof data !== 'object') {
    return { ok: false, error: 'TikTok did not return creator info.' };
  }
  return { ok: true, data };
}

/**
 * Build post_info for /v2/post/publish/video/init/ from audit-compliant client payload + creator_info.
 */
export function buildTikTokPostInfoFromPayload(
  p: TikTokDirectPostPayload,
  ci: TikTokCreatorInfoData
): { post_info: Record<string, unknown> } | { error: string } {
  if (!p.userConsentedToPublish) {
    return { error: 'TikTok requires explicit consent before publishing.' };
  }

  const options = ci.privacy_level_options;
  if (!Array.isArray(options) || options.length === 0) {
    return { error: 'TikTok did not return privacy options for this account. Reconnect TikTok and try again.' };
  }
  if (!options.includes(p.privacyLevel)) {
    return { error: 'Selected visibility is not allowed for this TikTok account. Pick another option.' };
  }

  if (p.commercialDisclosureOn && !p.yourBrand && !p.brandedContent) {
    return { error: 'Commercial content is on: choose either Your brand or Branded content.' };
  }

  if (p.commercialDisclosureOn && p.yourBrand && p.brandedContent) {
    return { error: 'Choose only one: Your brand or Branded content.' };
  }

  if (p.brandedContent && p.privacyLevel === 'SELF_ONLY') {
    return { error: 'Branded content cannot be set to Only me. Change visibility or turn off Branded content.' };
  }

  if (p.allowComment && ci.comment_disabled) {
    return { error: 'Comments are disabled for this TikTok account.' };
  }
  if (p.allowDuet && ci.duet_disabled) {
    return { error: 'Duets are disabled for this TikTok account.' };
  }
  if (p.allowStitch && ci.stitch_disabled) {
    return { error: 'Stitch is disabled for this TikTok account.' };
  }

  const maxDur = ci.max_video_post_duration_sec;
  if (typeof maxDur === 'number' && maxDur > 0) {
    if (!(typeof p.videoDurationSec === 'number' && p.videoDurationSec > 0)) {
      return {
        error: `Video duration is required to publish to TikTok for this account (${maxDur}s max). Wait for video metadata to load and try again.`,
      };
    }
    if (p.videoDurationSec > maxDur + 0.5) {
      return {
        error: `Video is longer than TikTok allows for this account (${maxDur}s). Use a shorter clip or post from the TikTok app.`,
      };
    }
  }

  const title = (p.title ?? '').trim().slice(0, 2200);

  const post_info: Record<string, unknown> = {
    title: title || undefined,
    privacy_level: p.privacyLevel,
    disable_comment: !p.allowComment,
    disable_duet: !p.allowDuet,
    disable_stitch: !p.allowStitch,
    brand_content_toggle: Boolean(p.commercialDisclosureOn && p.brandedContent),
    brand_organic_toggle: Boolean(p.commercialDisclosureOn && p.yourBrand),
  };

  return { post_info };
}

export function isTikTokDirectPostPayload(v: unknown): v is TikTokDirectPostPayload {
  if (!v || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.privacyLevel === 'string' &&
    typeof o.allowComment === 'boolean' &&
    typeof o.allowDuet === 'boolean' &&
    typeof o.allowStitch === 'boolean' &&
    typeof o.commercialDisclosureOn === 'boolean' &&
    typeof o.yourBrand === 'boolean' &&
    typeof o.brandedContent === 'boolean' &&
    (typeof o.maxDurationAcknowledged === 'undefined' || typeof o.maxDurationAcknowledged === 'boolean') &&
    typeof o.userConsentedToPublish === 'boolean' &&
    typeof o.title === 'string'
  );
}
