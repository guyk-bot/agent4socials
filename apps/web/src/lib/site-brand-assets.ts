/** Bumped when shared logo mark assets change (cache bust for browsers and CDNs). */
export const SITE_LOGO_V = '28';

/** Primary UI logo: transparent PNG mark (headers, auth, loaders, OAuth). */
export const SITE_LOGO_SRC = `/logo-mark.png?v=${SITE_LOGO_V}`;

/** SVG variant of the same mark. */
export const SITE_LOGO_SVG_SRC = `/logo.svg?v=${SITE_LOGO_V}`;
