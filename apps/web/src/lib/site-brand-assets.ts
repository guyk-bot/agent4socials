/** User-facing product name (funnel, app shell, emails, metadata). */
export const BRAND_NAME = 'iZop';

/** Prior product names that should display as {@link BRAND_NAME}. */
export function isLegacyProductBrandName(name: string): boolean {
  const n = name.trim().toLowerCase();
  return n === 'agent4socials' || n === 'izop';
}

/** Map stored legacy names (Agent4socials, Izop, izop, etc.) to {@link BRAND_NAME}. */
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
export const SITE_LOGO_V = '62';

/** Funnel header + chat hero logo box (keep in sync). */
export const SITE_HEADER_LOGO_CLASS = 'h-6 w-6 sm:h-7 sm:w-7 shrink-0 object-contain';

/** Funnel chat hero mark (beside "Hi, I'm iZop" and AI messages). */
export const CHAT_HERO_LOGO_PATH = '/chat-hero-logo.png';
export const CHAT_HERO_LOGO_SRC = `${CHAT_HERO_LOGO_PATH}?v=${SITE_LOGO_V}`;

/** Static path for next/image (no query string; see next.config images.localPatterns). */
export const SITE_LOGO_PATH = '/logo-mark.png';

/** White mark for dark app chrome (headers, loaders). */
export const SITE_LOGO_DARK_PATH = '/logo-mark-dark.png';

/** Primary UI logo with cache bust (use on <img>, not next/image). */
export const SITE_LOGO_SRC = `${SITE_LOGO_PATH}?v=${SITE_LOGO_V}`;

/** White UI logo for dark mode with cache bust. */
export const SITE_LOGO_DARK_SRC = `${SITE_LOGO_DARK_PATH}?v=${SITE_LOGO_V}`;

/** App chrome logo: white mark on the black dashboard header; light mark elsewhere. */
export function siteLogoSrcForTheme(theme: 'light' | 'dark'): string {
  return theme === 'dark' ? SITE_LOGO_DARK_SRC : SITE_LOGO_SRC;
}

/** Official iZop header (black bar) always uses the white mark. */
export function siteLogoSrcForAppHeader(theme: 'light' | 'dark', onBlackChrome = false): string {
  if (onBlackChrome) return SITE_LOGO_DARK_SRC;
  return siteLogoSrcForTheme(theme);
}

/** SVG variant of the same mark. */
export const SITE_LOGO_SVG_SRC = `/logo.svg?v=${SITE_LOGO_V}`;
