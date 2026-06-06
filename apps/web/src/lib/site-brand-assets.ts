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

/** Header / chrome background; must match the logo mark square (no opacity on headers). */
export const BRAND_HEADER_BG = '#170027';

/** Off-white copy on dark chrome (headers, funnel footer, dark marketing pages). */
export const BRAND_CHROME_TEXT = '#fcf7ff';

/** Static path for next/image (no query string; see next.config images.localPatterns). */
export const SITE_LOGO_PATH = '/logo-mark.png';

/** Primary UI logo with cache bust (use on <img>, not next/image). */
export const SITE_LOGO_SRC = `${SITE_LOGO_PATH}?v=${SITE_LOGO_V}`;

/** SVG variant of the same mark. */
export const SITE_LOGO_SVG_SRC = `/logo.svg?v=${SITE_LOGO_V}`;
