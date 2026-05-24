/** @jest-environment node */

import {
  aggregateMentionsByDate,
  mentionDateKey,
  mentionInRange,
} from '../mentions-time-series';

describe('mentions-time-series', () => {
  it('parses ISO timestamps to calendar days', () => {
    expect(mentionDateKey('2026-05-20T15:00:00.000Z')).toBe('2026-05-20');
    expect(mentionDateKey('')).toBeNull();
  });

  it('filters by since/until', () => {
    expect(mentionInRange('2026-05-15', '2026-05-10', '2026-05-20')).toBe(true);
    expect(mentionInRange('2026-05-05', '2026-05-10', '2026-05-20')).toBe(false);
  });

  it('aggregates mention counts by day', () => {
    const { total, series } = aggregateMentionsByDate(
      ['2026-05-20T10:00:00Z', '2026-05-20T12:00:00Z', '2026-05-21T08:00:00Z'],
      '2026-05-20',
      '2026-05-21'
    );
    expect(total).toBe(3);
    expect(series).toEqual([
      { date: '2026-05-20', value: 2 },
      { date: '2026-05-21', value: 1 },
    ]);
  });
});
