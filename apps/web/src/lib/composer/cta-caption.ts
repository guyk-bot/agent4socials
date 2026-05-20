/** Normalize text for CTA duplicate checks (ignore case, punctuation, line breaks). */
export function normalizeCtaCompare(s: string): string {
  return s
    .toLowerCase()
    .replace(/[\u2013\u2014]/g, ' ')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** True when the caption already contains the CTA (exact or as the closing block). */
export function captionContainsCta(caption: string, cta: string): boolean {
  const line = cta.trim();
  if (!line) return true;
  const nBody = normalizeCtaCompare(caption);
  const nCta = normalizeCtaCompare(line);
  if (!nCta) return true;
  if (nBody.includes(nCta)) return true;

  const parts = caption
    .split(/\n\n+/)
    .map((p) => p.trim())
    .filter(Boolean);
  const last = parts[parts.length - 1];
  if (last && normalizeCtaCompare(last) === nCta) return true;

  // Opening hook repeated in closing CTA (e.g. "Try X today!" + full CTA line).
  const hook = parts[0];
  if (hook && nCta.includes(normalizeCtaCompare(hook)) && nCta.length > normalizeCtaCompare(hook).length + 12) {
    return true;
  }
  return false;
}

/** Remove consecutive duplicate paragraphs (common when CTA is appended twice). */
export function dedupeTrailingParagraphs(text: string): string {
  const parts = text
    .split(/\n\n+/)
    .map((p) => p.trim())
    .filter(Boolean);
  while (parts.length >= 2) {
    const last = normalizeCtaCompare(parts[parts.length - 1]);
    const prev = normalizeCtaCompare(parts[parts.length - 2]);
    if (!last || !prev) break;
    if (last === prev || (last.length > 24 && prev.includes(last)) || (prev.length > 24 && last.includes(prev))) {
      parts.pop();
      continue;
    }
    break;
  }
  return parts.join('\n\n');
}

/** Append CTA once at the end; skip if already present; dedupe repeated closing blocks. */
export function mergeCaptionWithCta(caption: string, cta: string): string {
  let body = dedupeTrailingParagraphs(caption.trim());
  const line = cta.trim();
  if (!line) return body;
  if (captionContainsCta(body, line)) return body;
  return dedupeTrailingParagraphs(`${body}\n\n${line}`);
}
