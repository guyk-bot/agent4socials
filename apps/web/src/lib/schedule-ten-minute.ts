const pad = (n: number) => String(n).padStart(2, '0');

export const SCHEDULE_TEN_MINUTE_OPTIONS = ['00', '10', '20', '30', '40', '50'] as const;

export function localPartsToInput(parts: { y: number; mo: number; day: number; h: number; min: number }): string {
  return `${parts.y}-${pad(parts.mo)}-${pad(parts.day)}T${pad(parts.h)}:${pad(parts.min)}`;
}

/** Round local wall-clock minute up to the next 10-minute mark; rolls over the hour/day when needed. */
export function snapLocalWallMinutesUp(y: number, mo: number, day: number, h: number, min: number): { y: number; mo: number; day: number; h: number; min: number } {
  const snapped = Math.ceil(min / 10) * 10;
  if (snapped >= 60) {
    const d = new Date(y, mo - 1, day, h + 1, 0, 0, 0);
    return { y: d.getFullYear(), mo: d.getMonth() + 1, day: d.getDate(), h: d.getHours(), min: 0 };
  }
  return { y, mo, day, h, min: snapped };
}

export function parseLocalScheduleString(value: string): { y: number; mo: number; day: number; h: number; min: number } | null {
  if (!value.includes('T')) return null;
  const [dPart, tRaw] = value.split('T');
  const [y, mo, day] = dPart.split('-').map((x) => parseInt(x, 10));
  const t = (tRaw ?? '').slice(0, 5);
  const [hh, mm] = t.split(':').map((x) => parseInt(x, 10));
  if (![y, mo, day, hh, mm].every((n) => Number.isFinite(n))) return null;
  return { y, mo, day, h: hh, min: mm };
}

export function snapLocalScheduleStringMinuteUp(value: string): string | null {
  const p = parseLocalScheduleString(value);
  if (!p) return null;
  return localPartsToInput(snapLocalWallMinutesUp(p.y, p.mo, p.day, p.h, p.min));
}

/** Next local datetime on a 10-minute mark strictly after `now` (seconds/ms zeroed for comparison). */
export function nextFutureTenMinuteLocalString(now = new Date()): string {
  const d = new Date(now);
  d.setSeconds(0, 0);
  const remainder = d.getMinutes() % 10;
  if (remainder !== 0) {
    d.setMinutes(d.getMinutes() - remainder + 10, 0, 0);
  }
  while (d.getTime() <= now.getTime()) {
    d.setMinutes(d.getMinutes() + 10, 0, 0);
  }
  return localPartsToInput({
    y: d.getFullYear(),
    mo: d.getMonth() + 1,
    day: d.getDate(),
    h: d.getHours(),
    min: d.getMinutes(),
  });
}

export function isTenMinuteLocalScheduleString(value: string): boolean {
  const p = parseLocalScheduleString(value);
  if (!p) return false;
  return p.min % 10 === 0;
}

export function clampScheduleLocalToFloorMin(candidate: string, minLocal: string): string {
  const c = new Date(candidate);
  const m = new Date(minLocal);
  if (Number.isNaN(c.getTime()) || Number.isNaN(m.getTime())) return minLocal;
  if (c.getTime() >= m.getTime()) return candidate;
  return minLocal;
}

/** Map a stored instant to local `datetime-local`-style parts snapped up to the 10-minute grid (for legacy or off-grid values). */
export function isoInstantToLocalTenMinuteSnappedUp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const parts = snapLocalWallMinutesUp(d.getFullYear(), d.getMonth() + 1, d.getDate(), d.getHours(), d.getMinutes());
  return localPartsToInput(parts);
}
