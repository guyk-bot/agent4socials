/** Lightweight intent detection for landing chat analytics (no LLM). */

export function matchesPricingIntent(text: string): boolean {
  const t = text.trim().toLowerCase();
  if (!t) return false;
  return (
    /\b(pric(e|ing)|cost|how much|subscription|billing|plan|free trial|standard plan|pro plan)\b/.test(t) ||
    /\$\s*\d+/.test(t) ||
    /\b(is it free|pay for|upgrade)\b/.test(t)
  );
}

export function matchesInsightsIntent(text: string): boolean {
  const t = text.trim().toLowerCase();
  if (!t) return false;
  return (
    /\b(analytics|insights?|performance|metrics|engagement|reach|impressions|followers?|views?)\b/.test(t) ||
    /\b(what(?:'s| is) working|best post|top post|how (?:am i|are my)|growth)\b/.test(t)
  );
}

export function matchesPublishIntent(text: string): boolean {
  const t = text.trim().toLowerCase();
  if (!t) return false;
  return /\b(post|publish|schedule|caption|draft|upload)\b/.test(t);
}
