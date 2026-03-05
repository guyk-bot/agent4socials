export type LinkPageDesign = {
  theme?: string;
  bgType?: 'solid' | 'gradient' | 'image' | 'video';
  bgColor?: string;
  bgGradient?: string;
  bgImageUrl?: string;
  bgVideoUrl?: string;
  fontFamily?: string;
  buttonStyle?: 'rounded' | 'pill' | 'square' | 'outline' | 'filled' | 'shadow' | 'glass';
  buttonColor?: string;
  buttonTextColor?: string;
  buttonSize?: 'small' | 'medium' | 'large';
  textColor?: string;
  animation?: 'none' | 'fade' | 'slide' | 'scale' | 'stagger';
};

export type ThemePreset = {
  id: string;
  name: string;
  preview: string;
  design: LinkPageDesign;
};

export const FONT_OPTIONS = [
  { id: 'inter', name: 'Inter', family: 'Inter, system-ui, sans-serif' },
  { id: 'poppins', name: 'Poppins', family: 'Poppins, sans-serif' },
  { id: 'playfair', name: 'Playfair Display', family: '"Playfair Display", serif' },
  { id: 'roboto', name: 'Roboto', family: 'Roboto, sans-serif' },
  { id: 'montserrat', name: 'Montserrat', family: 'Montserrat, sans-serif' },
  { id: 'space', name: 'Space Grotesk', family: '"Space Grotesk", sans-serif' },
];

export const THEME_PRESETS: ThemePreset[] = [
  {
    id: 'minimal-light',
    name: 'Minimal Light',
    preview: 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)',
    design: {
      theme: 'minimal-light',
      bgType: 'solid',
      bgColor: '#ffffff',
      fontFamily: 'Inter, system-ui, sans-serif',
      buttonStyle: 'rounded',
      buttonColor: '#0f172a',
      buttonTextColor: '#ffffff',
      textColor: '#0f172a',
      animation: 'fade',
    },
  },
  {
    id: 'minimal-dark',
    name: 'Minimal Dark',
    preview: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
    design: {
      theme: 'minimal-dark',
      bgType: 'solid',
      bgColor: '#0f172a',
      fontFamily: 'Inter, system-ui, sans-serif',
      buttonStyle: 'rounded',
      buttonColor: '#ffffff',
      buttonTextColor: '#0f172a',
      textColor: '#ffffff',
      animation: 'fade',
    },
  },
  {
    id: 'sunset',
    name: 'Sunset Gradient',
    preview: 'linear-gradient(135deg, #f97316 0%, #ec4899 100%)',
    design: {
      theme: 'sunset',
      bgType: 'gradient',
      bgGradient: 'linear-gradient(135deg, #f97316 0%, #ec4899 50%, #8b5cf6 100%)',
      fontFamily: 'Poppins, sans-serif',
      buttonStyle: 'pill',
      buttonColor: '#ffffff',
      buttonTextColor: '#f97316',
      textColor: '#ffffff',
      animation: 'slide',
    },
  },
  {
    id: 'ocean',
    name: 'Ocean Gradient',
    preview: 'linear-gradient(135deg, #0ea5e9 0%, #06b6d4 100%)',
    design: {
      theme: 'ocean',
      bgType: 'gradient',
      bgGradient: 'linear-gradient(135deg, #0ea5e9 0%, #06b6d4 50%, #14b8a6 100%)',
      fontFamily: 'Montserrat, sans-serif',
      buttonStyle: 'pill',
      buttonColor: '#ffffff',
      buttonTextColor: '#0891b2',
      textColor: '#ffffff',
      animation: 'slide',
    },
  },
  {
    id: 'neon',
    name: 'Neon Glow',
    preview: 'linear-gradient(135deg, #18181b 0%, #27272a 100%)',
    design: {
      theme: 'neon',
      bgType: 'solid',
      bgColor: '#18181b',
      fontFamily: 'Space Grotesk, sans-serif',
      buttonStyle: 'shadow',
      buttonColor: '#a855f7',
      buttonTextColor: '#ffffff',
      textColor: '#ffffff',
      animation: 'scale',
    },
  },
  {
    id: 'glass',
    name: 'Glassmorphism',
    preview: 'linear-gradient(135deg, #e0e7ff 0%, #c7d2fe 100%)',
    design: {
      theme: 'glass',
      bgType: 'gradient',
      bgGradient: 'linear-gradient(135deg, #c7d2fe 0%, #ddd6fe 50%, #fbcfe8 100%)',
      fontFamily: 'Inter, system-ui, sans-serif',
      buttonStyle: 'glass',
      buttonColor: 'rgba(255,255,255,0.25)',
      buttonTextColor: '#1e1b4b',
      textColor: '#1e1b4b',
      animation: 'fade',
    },
  },
  {
    id: 'retro',
    name: 'Retro Warm',
    preview: 'linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)',
    design: {
      theme: 'retro',
      bgType: 'gradient',
      bgGradient: 'linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)',
      fontFamily: 'Playfair Display, serif',
      buttonStyle: 'rounded',
      buttonColor: '#92400e',
      buttonTextColor: '#fef3c7',
      textColor: '#78350f',
      animation: 'stagger',
    },
  },
  {
    id: 'professional',
    name: 'Professional',
    preview: 'linear-gradient(135deg, #1e3a5f 0%, #0f172a 100%)',
    design: {
      theme: 'professional',
      bgType: 'gradient',
      bgGradient: 'linear-gradient(135deg, #1e3a5f 0%, #0f172a 100%)',
      fontFamily: 'Roboto, sans-serif',
      buttonStyle: 'outline',
      buttonColor: '#ffffff',
      buttonTextColor: '#ffffff',
      textColor: '#ffffff',
      animation: 'fade',
    },
  },
];

export function getThemeById(id: string): ThemePreset | undefined {
  return THEME_PRESETS.find((t) => t.id === id);
}

export function getDefaultDesign(): LinkPageDesign {
  return THEME_PRESETS[0].design;
}
