/** Bumped when shared logo mark assets change (cache bust for browsers and CDNs). */
export const SITE_LOGO_V = '30';

/** Static path for next/image (no query string; see next.config images.localPatterns). */
export const SITE_LOGO_PATH = '/logo-mark.png';

/** Primary UI logo with cache bust (use on <img>, not next/image). */
export const SITE_LOGO_SRC = `${SITE_LOGO_PATH}?v=${SITE_LOGO_V}`;

/** SVG variant of the same mark. */
export const SITE_LOGO_SVG_SRC = `/logo.svg?v=${SITE_LOGO_V}`;
