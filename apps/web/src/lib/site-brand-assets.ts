/** User-facing product name (funnel, app shell, emails, metadata). */
export const BRAND_NAME = 'iZop';

/** Prior product names that should display as {@link BRAND_NAME}. */
export function isLegacyProductBrandName(name: string): boolean {
  const n = name.trim().toLowerCase();
  return n === 'agent4socials' || n === 'izop';
}

/** Map stored legacy names (Agent4socials, Izop, etc.) to {@link BRAND_NAME}. */
export function normalizeLegacyBrandName(name: string): string {
  return isLegacyProductBrandName(name) ? BRAND_NAME : name.trim();
}

/** Page / logo canvas background (matches the square mark PNG). */
export const BRAND_PAGE_BG = '#000000';

/** Header / chrome background (nav bar). */
export const BRAND_HEADER_BG = BRAND_PAGE_BG;

/** Copy on dark chrome (headers, funnel footer, dark marketing pages). */
export const BRAND_CHROME_TEXT = '#FFFFFF';

/** Bumped when shared logo mark assets change (cache bust for browsers and CDNs). */
export const SITE_LOGO_V = '70';

/** iZop AI outline mark (black on light backgrounds). */
export const IZOP_AI_MARK_DARK_PATH = '/izop-ai-mark-dark.png';

/** iZop AI outline mark (white on dark backgrounds / header nav). */
export const IZOP_AI_MARK_WHITE_PATH = '/izop-ai-mark-white.png';

export const IZOP_AI_MARK_DARK_SRC = `${IZOP_AI_MARK_DARK_PATH}?v=${SITE_LOGO_V}`;
export const IZOP_AI_MARK_WHITE_SRC = `${IZOP_AI_MARK_WHITE_PATH}?v=${SITE_LOGO_V}`;

/** Transparent line-art mask (header nav, matches Lucide stroke weight). */
export const IZOP_AI_MARK_MASK_PATH = '/izop-ai-mark-mask.png';
export const IZOP_AI_MARK_MASK_SRC = `${IZOP_AI_MARK_MASK_PATH}?v=${SITE_LOGO_V}`;

/** Chat empty state mask (slightly finer lines). */
export const IZOP_AI_MARK_MASK_CHAT_PATH = '/izop-ai-mark-mask-chat.png';
export const IZOP_AI_MARK_MASK_CHAT_SRC = `${IZOP_AI_MARK_MASK_CHAT_PATH}?v=${SITE_LOGO_V}`;

/** Canonical brand mark: white Z + lime green dot on black (filled, not outline). */
export const BRAND_MARK_PATH = '/logo-mark-dark.png';

/** Funnel header + chat hero logo box (keep in sync). */
export const SITE_HEADER_LOGO_CLASS = 'h-6 w-6 sm:h-7 sm:w-7 shrink-0 object-contain';

/** Funnel chat hero mark (beside "Hi, I'm iZop" and AI messages). Squircle crop of the same mark. */
export const CHAT_HERO_LOGO_PATH = '/chat-hero-logo.png';
export const CHAT_HERO_LOGO_SRC = `${CHAT_HERO_LOGO_PATH}?v=${SITE_LOGO_V}`;

/** Static path for next/image (no query string; see next.config images.localPatterns). */
export const SITE_LOGO_PATH = BRAND_MARK_PATH;

/** Same filled mark on black (legacy alias). */
export const SITE_LOGO_DARK_PATH = BRAND_MARK_PATH;

/** Primary UI logo with cache bust (use on <img>, not next/image). */
export const SITE_LOGO_SRC = `${BRAND_MARK_PATH}?v=${SITE_LOGO_V}`;

/** Brand mark for headers, funnel, and dark chrome. */
export const SITE_LOGO_DARK_SRC = `${BRAND_MARK_PATH}?v=${SITE_LOGO_V}`;

/** App chrome logo: always the green-dot mark. */
export function siteLogoSrcForTheme(_theme: 'light' | 'dark'): string {
  return SITE_LOGO_DARK_SRC;
}

/** Official iZop header (black bar) always uses the green-dot mark. */
export function siteLogoSrcForAppHeader(_theme: 'light' | 'dark', _onBlackChrome = false): string {
  return SITE_LOGO_DARK_SRC;
}

/** SVG variant of the same mark. */
export const SITE_LOGO_SVG_SRC = `/logo.svg?v=${SITE_LOGO_V}`;
