/** Line-level diff for brand context preview (show only what changed). */

export type DiffSeg = { type: 'same' | 'add' | 'del'; text: string };

function diffLinesArray(a: string[], b: string[]): DiffSeg[] {
  const n = a.length;
  const m = b.length;
  if (n * m > 250_000) {
    const segs: DiffSeg[] = [];
    if (a.length) segs.push({ type: 'del', text: a.join('\n') });
    if (b.length) segs.push({ type: 'add', text: b.join('\n') });
    return segs;
  }

  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i]![j] = a[i] === b[j] ? dp[i + 1]![j + 1]! + 1 : Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!);
    }
  }

  const segs: DiffSeg[] = [];
  const push = (type: DiffSeg['type'], text: string) => {
    const last = segs[segs.length - 1];
    if (last && last.type === type) last.text += `\n${text}`;
    else segs.push({ type, text });
  };

  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      push('same', a[i]!);
      i++;
      j++;
    } else if (dp[i + 1]![j]! >= dp[i]![j + 1]!) {
      push('del', a[i]!);
      i++;
    } else {
      push('add', b[j]!);
      j++;
    }
  }
  while (i < n) push('del', a[i++]!);
  while (j < m) push('add', b[j++]!);
  return segs;
}

export function diffBrandContextText(oldStr: string, newStr: string): DiffSeg[] {
  const a = oldStr.split('\n');
  const b = newStr.split('\n');
  if (a.length > 1 || b.length > 1) return diffLinesArray(a, b);

  // Single-line: word-level fallback
  const wordsA = oldStr.match(/\s+|\S+/g) ?? [];
  const wordsB = newStr.match(/\s+|\S+/g) ?? [];
  const n = wordsA.length;
  const m = wordsB.length;
  if (n * m > 400_000) {
    const segs: DiffSeg[] = [];
    if (oldStr) segs.push({ type: 'del', text: oldStr });
    if (newStr) segs.push({ type: 'add', text: newStr });
    return segs;
  }

  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i]![j] = wordsA[i] === wordsB[j] ? dp[i + 1]![j + 1]! + 1 : Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!);
    }
  }

  const segs: DiffSeg[] = [];
  const push = (type: DiffSeg['type'], text: string) => {
    const last = segs[segs.length - 1];
    if (last && last.type === type) last.text += text;
    else segs.push({ type, text });
  };
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (wordsA[i] === wordsB[j]) {
      push('same', wordsA[i]!);
      i++;
      j++;
    } else if (dp[i + 1]![j]! >= dp[i]![j + 1]!) {
      push('del', wordsA[i]!);
      i++;
    } else {
      push('add', wordsB[j]!);
      j++;
    }
  }
  while (i < n) push('del', wordsA[i++]!);
  while (j < m) push('add', wordsB[j++]!);
  return segs;
}
