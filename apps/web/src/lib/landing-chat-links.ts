import { resolveAppBaseUrl } from '@/lib/app-base-url';
import { normalizeLandingChatText } from '@/lib/chat-hero-script';

export type LandingChatSiteLinks = {
  home: string;
  pricing: string;
  pricingSection: string;
  signup: string;
  login: string;
  dashboard: string;
  help: string;
  support: string;
  features: string;
  faq: string;
  privacy: string;
  terms: string;
};

export function getLandingChatSiteLinks(): LandingChatSiteLinks {
  const base = resolveAppBaseUrl();
  return {
    home: base,
    pricing: `${base}/pricing`,
    pricingSection: `${base}/#pricing`,
    signup: `${base}/signup`,
    login: `${base}/login`,
    dashboard: `${base}/dashboard`,
    help: `${base}/help`,
    support: `${base}/help#support-ticket`,
    features: `${base}/#features`,
    faq: `${base}/#faq`,
    privacy: `${base}/privacy`,
    terms: `${base}/terms`,
  };
}

/** For LLM + scripted replies: list URLs the funnel chat may share. */
export function landingChatLinksKnowledgeBlock(): string {
  const links = getLandingChatSiteLinks();
  return [
    'Links you may share when users ask (always include the full https URL):',
    `Pricing (full page): ${links.pricing}`,
    `Pricing (on homepage): ${links.pricingSection}`,
    `Sign up free: ${links.signup}`,
    `Log in: ${links.login}`,
    `Dashboard (after sign-in): ${links.dashboard}`,
    `Help center: ${links.help}`,
    `Support ticket: ${links.support}`,
    `Features: ${links.features}`,
    `FAQ: ${links.faq}`,
  ].join('\n');
}

function fixLinkTypos(text: string): string {
  return text
    .replace(/\blinnk\b/g, 'link')
    .replace(/\bpricng\b/g, 'pricing')
    .replace(/\bpricin\b/g, 'pricing')
    .replace(/\bpricing\s+age\b/g, 'pricing page')
    .replace(/\bpric\s+page\b/g, 'pricing page');
}

function asksForLink(text: string): boolean {
  const lower = fixLinkTypos(normalizeLandingChatText(text));
  return (
    /\b(link|url|website|web\s*site)\b/.test(lower) ||
    /\b(send|share|give|show)\s+me\b/.test(lower) ||
    /\bwhere\s+(?:is|can\s+i\s+(?:find|see|get))\b/.test(lower) ||
    /\btake\s+me\s+to\b/.test(lower) ||
    /\bopen\b.*\bpage\b/.test(lower)
  );
}

/** Scripted reply when the user wants a site link (checked before LLM). */
export function answerLandingChatLinkRequest(text: string): string | null {
  const lower = fixLinkTypos(normalizeLandingChatText(text));
  if (!asksForLink(lower) && !/\b(pricing|signup|sign up|login|log in|dashboard|help|support|faq|features)\s+page\b/.test(lower)) {
    return null;
  }

  const links = getLandingChatSiteLinks();

  if (/\b(support|ticket|contact\s+support|talk\s+to\s+someone)\b/.test(lower)) {
    return `Open a support ticket here: ${links.support} — our team typically replies within 24 hours.`;
  }

  if (/\b(help|help\s+center|documentation|docs)\b/.test(lower)) {
    return `Help center: ${links.help}`;
  }

  if (/\b(sign\s*up|register|create\s+account|try\s+for\s+free|free\s+account)\b/.test(lower)) {
    return `Create your free account here: ${links.signup} — no credit card required.`;
  }

  if (/\b(log\s*in|sign\s*in)\b/.test(lower)) {
    return `Log in here: ${links.login}`;
  }

  if (/\b(dashboard|app)\b/.test(lower)) {
    return `After you sign in, your dashboard is here: ${links.dashboard}`;
  }

  if (/\b(faq|frequently\s+asked)\b/.test(lower)) {
    return `FAQ is on the homepage: ${links.faq}`;
  }

  if (/\b(features?|how\s+it\s+works)\b/.test(lower)) {
    return `See features here: ${links.features}`;
  }

  if (/\b(price|pricing|plan|cost|subscription|\$\d|standard|pro\s+plan)\b/.test(lower)) {
    return `Pricing page: ${links.pricing} — compare Free, Standard ($29/mo), and Pro ($47/mo). You can also scroll to plans on the homepage: ${links.pricingSection}`;
  }

  if (asksForLink(lower)) {
    return `Homepage: ${links.home} — or pricing: ${links.pricing}, sign up: ${links.signup}, help: ${links.help}`;
  }

  return null;
}
