/**
 * Central platform theme definitions.
 * Use these everywhere (DataSyncBanner, ConnectView, sidebar, badges, etc.)
 * to keep colors consistent across the entire app.
 */

export type PlatformKey = 'INSTAGRAM' | 'FACEBOOK' | 'YOUTUBE' | 'TIKTOK' | 'TWITTER' | 'LINKEDIN' | 'PINTEREST';

export interface PlatformTheme {
  /** Tailwind gradient string for backgrounds (e.g. DataSyncBanner) */
  gradient: string;
  /** Solid Tailwind bg color for buttons/badges */
  solidBg: string;
  /** Tailwind text color on a white background */
  textColor: string;
  /** Tailwind border color */
  borderColor: string;
  /** Tailwind bg for light tinted panels */
  lightBg: string;
  /** Hex for canvas/SVG usage */
  hex: string;
  /** Human-readable name */
  label: string;
}

export const PLATFORM_THEMES: Record<string, PlatformTheme> = {
  INSTAGRAM: {
    gradient: 'from-pink-500 via-fuchsia-500 to-purple-600',
    solidBg: 'bg-gradient-to-r from-pink-500 to-purple-600',
    textColor: 'text-pink-600',
    borderColor: 'border-pink-300',
    lightBg: 'bg-pink-50',
    hex: '#E1306C',
    label: 'Instagram',
  },
  FACEBOOK: {
    gradient: 'from-blue-500 to-blue-700',
    solidBg: 'bg-blue-600',
    textColor: 'text-blue-600',
    borderColor: 'border-blue-300',
    lightBg: 'bg-blue-50',
    hex: '#1877F2',
    label: 'Facebook',
  },
  YOUTUBE: {
    gradient: 'from-red-500 to-red-700',
    solidBg: 'bg-red-600',
    textColor: 'text-red-600',
    borderColor: 'border-red-300',
    lightBg: 'bg-red-50',
    hex: '#FF0000',
    label: 'YouTube',
  },
  TIKTOK: {
    gradient: 'from-neutral-900 via-neutral-800 to-neutral-900',
    solidBg: 'bg-neutral-900',
    textColor: 'text-neutral-900',
    borderColor: 'border-neutral-700',
    lightBg: 'bg-neutral-100',
    hex: '#010101',
    label: 'TikTok',
  },
  TWITTER: {
    gradient: 'from-neutral-600 to-neutral-800',
    solidBg: 'bg-neutral-700',
    textColor: 'text-neutral-700',
    borderColor: 'border-neutral-400',
    lightBg: 'bg-neutral-100',
    hex: '#525252',
    label: 'X (Twitter)',
  },
  LINKEDIN: {
    gradient: 'from-blue-600 to-blue-800',
    solidBg: 'bg-blue-700',
    textColor: 'text-blue-700',
    borderColor: 'border-blue-400',
    lightBg: 'bg-blue-50',
    hex: '#0A66C2',
    label: 'LinkedIn',
  },
  PINTEREST: {
    gradient: 'from-rose-600 to-red-700',
    solidBg: 'bg-[#E60023]',
    textColor: 'text-[#E60023]',
    borderColor: 'border-rose-400',
    lightBg: 'bg-rose-50',
    hex: '#E60023',
    label: 'Pinterest',
  },
  DEFAULT: {
    gradient: 'from-indigo-500 to-violet-600',
    solidBg: 'bg-indigo-600',
    textColor: 'text-indigo-600',
    borderColor: 'border-indigo-300',
    lightBg: 'bg-indigo-50',
    hex: '#6366F1',
    label: 'Social',
  },
};

export function getPlatformTheme(platform?: string | null): PlatformTheme {
  return PLATFORM_THEMES[platform?.toUpperCase() ?? ''] ?? PLATFORM_THEMES.DEFAULT;
}
