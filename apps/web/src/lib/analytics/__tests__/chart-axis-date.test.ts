/** @jest-environment node */

import {
  formatSparseMonthAxisTick,
  sparseMonthTickLabel,
} from '../chart-axis-date';

describe('formatSparseMonthAxisTick', () => {
  const ticks = ['2026-03-05', '2026-03-12', '2026-04-01', '2026-04-18'];

  it('shows month and day on the first tick', () => {
    expect(formatSparseMonthAxisTick('2026-03-05', 0, ticks)).toBe('Mar 5');
  });

  it('shows day only within the same month', () => {
    expect(formatSparseMonthAxisTick('2026-03-12', 1, ticks)).toBe('12');
  });

  it('shows month again when the month changes', () => {
    expect(formatSparseMonthAxisTick('2026-04-01', 2, ticks)).toBe('Apr 1');
    expect(formatSparseMonthAxisTick('2026-04-18', 3, ticks)).toBe('18');
  });
});

describe('sparseMonthTickLabel', () => {
  it('falls back to full short date when tick is missing from list', () => {
    const label = sparseMonthTickLabel('2026-05-24', ['2026-05-01']);
    expect(label).toMatch(/May/);
    expect(label).toMatch(/24/);
  });
});
