/**
 * iZop brand color tokens — single source of truth for TS/JS usage.
 * CSS variables in globals.css mirror these values for Tailwind and stylesheets.
 */

export const colors = {
  purple: {
    DEFAULT: '#7C3AED',
    dark: '#4F46E5',
    gradient: 'linear-gradient(135deg, #7C3AED, #4F46E5)',
    gradientBar: 'linear-gradient(90deg, #7C3AED, #4F46E5, #0EA5E9)',
    soft: 'rgba(124, 58, 237, 0.15)',
    border: 'rgba(124, 58, 237, 0.3)',
    text: '#A78BFA',
  },
  dark: {
    void: '#0A0A0F',
    surface: '#111118',
    border: '#1E1E2A',
    hover: '#16161F',
  },
  light: {
    cloud: '#F8F7FC',
    surface: '#FFFFFF',
    border: '#E8E6DF',
    hover: '#F1EFF8',
  },
  text: {
    primary: '#FFFFFF',
    primaryLight: '#1a1a1a',
    muted: '#888780',
    ink: '#1a1a1a',
  },
  accent: {
    sky: '#0EA5E9',
    growth: '#10B981',
    amber: '#F59E0B',
    alert: '#EF4444',
  },
} as const;

/** Chart and analytics palette */
export const chartColors = {
  primary: colors.purple.DEFAULT,
  secondary: colors.accent.sky,
  positive: colors.accent.growth,
  negative: colors.accent.alert,
  neutral: colors.text.muted,
} as const;

export type BrandColors = typeof colors;
