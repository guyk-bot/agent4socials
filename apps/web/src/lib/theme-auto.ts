import SunCalc from 'suncalc';

export type ResolvedTheme = 'light' | 'dark';

const COORDS_KEY = 'agent4socials-theme-coords';

/** Approximate city centers when geolocation is unavailable. */
const TZ_FALLBACK: Record<string, { lat: number; lng: number }> = {
  'America/New_York': { lat: 40.7128, lng: -74.006 },
  'America/Chicago': { lat: 41.8781, lng: -87.6298 },
  'America/Denver': { lat: 39.7392, lng: -104.9903 },
  'America/Los_Angeles': { lat: 34.0522, lng: -118.2437 },
  'America/Phoenix': { lat: 33.4484, lng: -112.074 },
  'Europe/London': { lat: 51.5074, lng: -0.1278 },
  'Europe/Paris': { lat: 48.8566, lng: 2.3522 },
  'Europe/Berlin': { lat: 52.52, lng: 13.405 },
  'Asia/Jerusalem': { lat: 31.7683, lng: 35.2137 },
  'Asia/Dubai': { lat: 25.2048, lng: 55.2708 },
  'Asia/Tokyo': { lat: 35.6762, lng: 139.6503 },
  'Asia/Singapore': { lat: 1.3521, lng: 103.8198 },
  'Australia/Sydney': { lat: -33.8688, lng: 151.2093 },
};

export function fallbackCoordsForTimezone(): { lat: number; lng: number } {
  if (typeof window === 'undefined') return { lat: 40, lng: 0 };
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return TZ_FALLBACK[tz] ?? { lat: 40, lng: 0 };
}

export function readCachedThemeCoords(): { lat: number; lng: number } | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(COORDS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { lat?: number; lng?: number };
    if (typeof parsed.lat === 'number' && typeof parsed.lng === 'number') {
      return { lat: parsed.lat, lng: parsed.lng };
    }
  } catch {
    /* ignore */
  }
  return null;
}

export function cacheThemeCoords(coords: { lat: number; lng: number }): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(COORDS_KEY, JSON.stringify(coords));
  } catch {
    /* ignore */
  }
}

export async function getThemeCoords(): Promise<{ lat: number; lng: number }> {
  const cached = readCachedThemeCoords();
  if (cached) return cached;

  const fallback = fallbackCoordsForTimezone();

  if (typeof window === 'undefined' || !navigator.geolocation) {
    return fallback;
  }

  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        cacheThemeCoords(coords);
        resolve(coords);
      },
      () => resolve(fallback),
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 7 * 24 * 60 * 60 * 1000 }
    );
  });
}

/** Light between sunrise and sunset; dark otherwise. */
export function themeFromSunPosition(
  lat: number,
  lng: number,
  now: Date = new Date()
): ResolvedTheme {
  const times = SunCalc.getTimes(now, lat, lng);
  const t = now.getTime();
  if (t >= times.sunrise.getTime() && t < times.sunset.getTime()) return 'light';
  return 'dark';
}

/** Rough theme for the layout inline script before React hydrates. */
export function roughAutoThemeFromClock(now: Date = new Date()): ResolvedTheme {
  const h = now.getHours();
  return h >= 6 && h < 18 ? 'light' : 'dark';
}

export function msUntilNextSunTransition(
  lat: number,
  lng: number,
  now: Date = new Date()
): number {
  const transitions: number[] = [];

  for (let dayOffset = 0; dayOffset <= 1; dayOffset += 1) {
    const d = new Date(now);
    d.setDate(d.getDate() + dayOffset);
    const times = SunCalc.getTimes(d, lat, lng);
    for (const point of [times.sunrise, times.sunset]) {
      const ms = point.getTime();
      if (ms > now.getTime()) transitions.push(ms);
    }
  }

  if (!transitions.length) return 60_000;
  return Math.max(1_000, Math.min(...transitions) - now.getTime() + 500);
}
