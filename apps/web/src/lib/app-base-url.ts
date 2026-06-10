/** Production canonical origin (www is primary; naked izop.ai redirects in Vercel). */
export const CANONICAL_APP_ORIGIN = 'https://www.izop.ai';

export const CANONICAL_APP_HOST = 'www.izop.ai';

/** Canonical app origin for links, OAuth, and emails. */
export function resolveAppBaseUrl(): string {
  const raw =
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '') ||
    CANONICAL_APP_ORIGIN;
  return raw.replace(/\/+$/, '');
}

/** Hostnames that should 308 redirect to {@link CANONICAL_APP_ORIGIN}. */
export const LEGACY_APP_HOSTS = [
  'agent4socials.com',
  'www.agent4socials.com',
  'izop.io',
  'www.izop.io',
  'izop.app',
  'www.izop.app',
] as const;

/** Hostnames the model sometimes hallucinates; rewrite to in-app relative paths. */
const LEGACY_OR_INVALID_APP_HOSTS = new Set<string>([
  ...LEGACY_APP_HOSTS,
  CANONICAL_APP_HOST,
  'app.agent4socials.com',
]);

const IN_APP_PATH_PREFIXES = [
  '/composer',
  '/dashboard',
  '/calendar',
  '/posts',
  '/connect',
  '/help',
  '/signup',
  '/login',
];

export function isInAppPath(pathname: string): boolean {
  return IN_APP_PATH_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/**
 * Rewrite bad or same-app absolute URLs to relative paths for in-dashboard navigation.
 * Returns null if the URL should stay external.
 */
export function normalizeInAppChatHref(href: string, currentOrigin?: string): string | null {
  try {
    const base = currentOrigin || resolveAppBaseUrl();
    const u = new URL(href, base);
    const relative = `${u.pathname}${u.search}${u.hash}`;

    if (LEGACY_OR_INVALID_APP_HOSTS.has(u.hostname) && isInAppPath(u.pathname)) {
      return relative;
    }

    if (currentOrigin) {
      const current = new URL(currentOrigin);
      if (u.host === current.host && isInAppPath(u.pathname)) {
        return relative;
      }
    }

    return null;
  } catch {
    return null;
  }
}

export function appLinkRulesForPrompt(): string {
  const base = resolveAppBaseUrl();
  return [
    'In-app links (critical):',
    `- The live app is ${base}. There is NO separate app subdomain.`,
    '- Never invent or paste full URLs for pages inside the dashboard (Composer, Dashboard, Inbox, etc.).',
    '- When the user asks to open Composer or see drafts, call show_app_in_chat with view composer and/or open_composer_draft so the chat shows a working Open Composer button.',
    `- If you must mention a path in text, use a relative path only (example: /composer), never a hallucinated subdomain.`,
  ].join('\n');
}
