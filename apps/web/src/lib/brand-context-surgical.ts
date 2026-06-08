/** Helpers so brand-context updates preserve unchanged wording (surgical edits). */

function tokenizeWords(s: string): string[] {
  return s.toLowerCase().match(/[a-z0-9]+/g) ?? [];
}

/** 0–1 overlap of word sets between two strings. */
export function wordOverlapRatio(a: string, b: string): number {
  const wa = new Set(tokenizeWords(a));
  const wb = new Set(tokenizeWords(b));
  if (!wa.size && !wb.size) return 1;
  if (!wa.size || !wb.size) return 0;
  let overlap = 0;
  for (const w of wa) if (wb.has(w)) overlap += 1;
  return overlap / Math.max(wa.size, wb.size);
}

/** Skip AI paraphrase of a field the user did not ask to change. */
export function shouldSkipCosmeticRewrite(current: string, proposed: string): boolean {
  const cur = current.trim();
  const next = proposed.trim();
  if (!cur || !next) return false;
  if (cur === next) return true;
  return wordOverlapRatio(cur, next) >= 0.88;
}

/**
 * When the model rewrites productDescription from scratch, merge against current:
 * drop removed feature bullets (e.g. Automation) and append genuinely new lines.
 */
export function surgicalProductDescriptionUpdate(current: string, aiProposed: string): string {
  const cur = current.trim();
  const proposed = aiProposed.trim();
  if (!cur) return proposed;
  if (!proposed) return cur;
  if (wordOverlapRatio(cur, proposed) >= 0.55) return proposed;

  const proposedLower = proposed.toLowerCase();
  const automationRemoved = /\bautomation\b/i.test(cur) && !/\bautomation\b/i.test(proposed);
  const result: string[] = [];

  for (const line of current.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) {
      result.push(line);
      continue;
    }
    if (automationRemoved && /\bautomation\b/i.test(trimmed)) continue;

    const core = trimmed.replace(/^[-•*]\s*/, '').toLowerCase();
    const isBullet = /^[-•*]/.test(trimmed);
    if (isBullet && core.length > 8) {
      const head = core.split(/[:.]/)[0]?.trim() ?? core;
      const headWords = head.split(/\s+/).filter((w) => w.length > 3);
      const headInProposed =
        headWords.length > 0 &&
        headWords.filter((w) => proposedLower.includes(w)).length / headWords.length >= 0.5;
      if (!headInProposed && head.length > 4) continue;
    }
    result.push(line);
  }

  for (const raw of proposed.split('\n')) {
    const trimmed = raw.trim();
    if (!trimmed || trimmed.length < 20) continue;
    const snippet = trimmed.replace(/^[-•*]\s*/, '').toLowerCase().slice(0, 40);
    const already = result.some((r) => r.toLowerCase().includes(snippet));
    if (!already) {
      result.push(/^[-•*]/.test(trimmed) ? trimmed : `• ${trimmed}`);
    }
  }

  const merged = result.join('\n').trim();
  return merged || proposed;
}
