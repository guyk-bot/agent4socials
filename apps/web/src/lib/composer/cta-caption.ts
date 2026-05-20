/** Normalize text for CTA duplicate checks (ignore case, punctuation, line breaks). */
export function normalizeCtaCompare(s: string): string {
  return s
    .toLowerCase()
    .replace(/[\u2013\u2014]/g, ' ')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function splitParagraphs(text: string): string[] {
  return text
    .split(/\n\n+/)
    .map((p) => p.trim())
    .filter(Boolean);
}

/** True when a paragraph is the CTA or a near-duplicate of it. */
export function paragraphMatchesCta(paragraph: string, cta: string): boolean {
  const line = cta.trim();
  if (!line) return false;
  const nPara = normalizeCtaCompare(paragraph);
  const nCta = normalizeCtaCompare(line);
  if (!nPara || !nCta) return false;
  if (nPara === nCta) return true;
  if (nPara.length >= 20 && nCta.length >= 20) {
    if (nPara.includes(nCta) || nCta.includes(nPara)) return true;
  }
  return false;
}

/** True when the caption already contains the CTA (exact or as the closing block). */
export function captionContainsCta(caption: string, cta: string): boolean {
  const line = cta.trim();
  if (!line) return true;
  const nBody = normalizeCtaCompare(caption);
  const nCta = normalizeCtaCompare(line);
  if (!nCta) return true;
  if (nBody.includes(nCta)) return true;

  const parts = splitParagraphs(caption);
  const last = parts[parts.length - 1];
  if (last && paragraphMatchesCta(last, line)) return true;

  // Opening hook repeated in closing CTA (e.g. "Try X today!" + full CTA line).
  const hook = parts[0];
  if (hook && nCta.includes(normalizeCtaCompare(hook)) && nCta.length > normalizeCtaCompare(hook).length + 12) {
    return true;
  }
  return false;
}

/** Remove consecutive duplicate paragraphs (common when CTA is appended twice). */
export function dedupeTrailingParagraphs(text: string): string {
  const parts = splitParagraphs(text);
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

/** Drop every paragraph that matches the CTA so we can append it exactly once at the end. */
export function stripCtaParagraphs(caption: string, cta: string): string {
  const line = cta.trim();
  if (!line) return dedupeTrailingParagraphs(caption.trim());
  const parts = splitParagraphs(caption);
  const kept = parts.filter((p) => !paragraphMatchesCta(p, line));
  return kept.join('\n\n').trim();
}

/** Append CTA once at the end; strip prior CTA blocks; dedupe repeated closings. */
export function mergeCaptionWithCta(caption: string, cta: string): string {
  const line = cta.trim();
  if (!line) return dedupeTrailingParagraphs(caption.trim());

  let body = stripCtaParagraphs(caption, line);
  body = dedupeTrailingParagraphs(body);
  if (!body) return line;
  return dedupeTrailingParagraphs(`${body}\n\n${line}`);
}
