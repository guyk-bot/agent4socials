import { FONT_OPTIONS } from '@/components/smart-links/themes';

export type FontPreviewEntry = {
  id: string;
  label: string;
  /** CSS font-family value */
  family: string;
  note?: string;
  group: 'app' | 'smart-links' | 'modern-sans' | 'serif' | 'system';
  /** Google Fonts family param, e.g. DM+Sans:wght@400;500;700 */
  googleParam?: string;
};

/** Self-hosted Satoshi is handled separately in the preview UI. */
export const SATOSHI_PREVIEW_ENTRY: Pick<FontPreviewEntry, 'id' | 'label' | 'note' | 'group'> = {
  id: 'satoshi',
  label: 'Satoshi',
  note: 'Current app + funnel default (self-hosted)',
  group: 'app',
};

const APP_FONTS: FontPreviewEntry[] = [
  {
    id: 'inter',
    label: 'Inter',
    family: 'Inter, system-ui, sans-serif',
    note: 'Previous app body font',
    group: 'app',
    googleParam: 'Inter:wght@400;500;700',
  },
  {
    id: 'outfit',
    label: 'Outfit',
    family: '"Outfit", sans-serif',
    note: 'Previous app heading font',
    group: 'app',
    googleParam: 'Outfit:wght@400;500;700',
  },
];

const SMART_LINK_FONTS: FontPreviewEntry[] = FONT_OPTIONS.map((f) => ({
  id: f.id,
  label: f.name,
  family: f.family,
  note: 'Smart Links option',
  group: 'smart-links' as const,
  googleParam: googleParamForFamily(f.family),
}));

/** Popular web fonts for SaaS / marketing (not all wired into the app yet). */
const MODERN_SANS_FONTS: FontPreviewEntry[] = [
  { id: 'dm-sans', label: 'DM Sans', family: '"DM Sans", sans-serif', group: 'modern-sans', googleParam: 'DM+Sans:wght@400;500;700' },
  { id: 'plus-jakarta', label: 'Plus Jakarta Sans', family: '"Plus Jakarta Sans", sans-serif', group: 'modern-sans', googleParam: 'Plus+Jakarta+Sans:wght@400;500;700' },
  { id: 'manrope', label: 'Manrope', family: 'Manrope, sans-serif', group: 'modern-sans', googleParam: 'Manrope:wght@400;500;700' },
  { id: 'figtree', label: 'Figtree', family: 'Figtree, sans-serif', group: 'modern-sans', googleParam: 'Figtree:wght@400;500;700' },
  { id: 'work-sans', label: 'Work Sans', family: '"Work Sans", sans-serif', group: 'modern-sans', googleParam: 'Work+Sans:wght@400;500;700' },
  { id: 'lexend', label: 'Lexend', family: 'Lexend, sans-serif', group: 'modern-sans', googleParam: 'Lexend:wght@400;500;700' },
  { id: 'sora', label: 'Sora', family: 'Sora, sans-serif', group: 'modern-sans', googleParam: 'Sora:wght@400;500;700' },
  { id: 'nunito-sans', label: 'Nunito Sans', family: '"Nunito Sans", sans-serif', group: 'modern-sans', googleParam: 'Nunito+Sans:wght@400;500;700' },
  { id: 'lato', label: 'Lato', family: 'Lato, sans-serif', group: 'modern-sans', googleParam: 'Lato:wght@400;700' },
  { id: 'open-sans', label: 'Open Sans', family: '"Open Sans", sans-serif', group: 'modern-sans', googleParam: 'Open+Sans:wght@400;500;700' },
  { id: 'source-sans-3', label: 'Source Sans 3', family: '"Source Sans 3", sans-serif', group: 'modern-sans', googleParam: 'Source+Sans+3:wght@400;500;700' },
  { id: 'ibm-plex-sans', label: 'IBM Plex Sans', family: '"IBM Plex Sans", sans-serif', group: 'modern-sans', googleParam: 'IBM+Plex+Sans:wght@400;500;700' },
  { id: 'urbanist', label: 'Urbanist', family: 'Urbanist, sans-serif', group: 'modern-sans', googleParam: 'Urbanist:wght@400;500;700' },
  { id: 'rubik', label: 'Rubik', family: 'Rubik, sans-serif', group: 'modern-sans', googleParam: 'Rubik:wght@400;500;700' },
  { id: 'mulish', label: 'Mulish', family: 'Mulish, sans-serif', group: 'modern-sans', googleParam: 'Mulish:wght@400;500;700' },
  { id: 'karla', label: 'Karla', family: 'Karla, sans-serif', group: 'modern-sans', googleParam: 'Karla:wght@400;500;700' },
  { id: 'raleway', label: 'Raleway', family: 'Raleway, sans-serif', group: 'modern-sans', googleParam: 'Raleway:wght@400;500;700' },
  { id: 'archivo', label: 'Archivo', family: 'Archivo, sans-serif', group: 'modern-sans', googleParam: 'Archivo:wght@400;500;700' },
  { id: 'red-hat-display', label: 'Red Hat Display', family: '"Red Hat Display", sans-serif', group: 'modern-sans', googleParam: 'Red+Hat+Display:wght@400;500;700' },
  { id: 'bricolage', label: 'Bricolage Grotesque', family: '"Bricolage Grotesque", sans-serif', group: 'modern-sans', googleParam: 'Bricolage+Grotesque:wght@400;500;700' },
  { id: 'geist', label: 'Geist', family: 'Geist, sans-serif', note: 'Vercel default (Google CDN)', group: 'modern-sans', googleParam: 'Geist:wght@400;500;700' },
];

const SERIF_FONTS: FontPreviewEntry[] = [
  { id: 'lora', label: 'Lora', family: 'Lora, serif', group: 'serif', googleParam: 'Lora:wght@400;500;700' },
  { id: 'merriweather', label: 'Merriweather', family: 'Merriweather, serif', group: 'serif', googleParam: 'Merriweather:wght@400;700' },
  { id: 'libre-baskerville', label: 'Libre Baskerville', family: '"Libre Baskerville", serif', group: 'serif', googleParam: 'Libre+Baskerville:wght@400;700' },
  { id: 'source-serif-4', label: 'Source Serif 4', family: '"Source Serif 4", serif', group: 'serif', googleParam: 'Source+Serif+4:wght@400;500;700' },
  { id: 'fraunces', label: 'Fraunces', family: 'Fraunces, serif', group: 'serif', googleParam: 'Fraunces:wght@400;500;700' },
  { id: 'bebas-neue', label: 'Bebas Neue', family: '"Bebas Neue", sans-serif', note: 'Brand wordmark X styling only', group: 'serif', googleParam: 'Bebas+Neue' },
];

const SYSTEM_FONTS: FontPreviewEntry[] = [
  { id: 'system-ui', label: 'System UI', family: 'system-ui, sans-serif', note: 'Browser default sans', group: 'system' },
  { id: 'georgia', label: 'Georgia', family: 'Georgia, serif', note: 'System serif reference', group: 'system' },
];

export const FONT_PREVIEW_GROUPS: Array<{ id: FontPreviewEntry['group']; title: string; description: string }> = [
  { id: 'app', title: 'App fonts', description: 'Used or previously used across iZop.' },
  { id: 'smart-links', title: 'Smart Links fonts', description: 'Available in Smart Links today.' },
  { id: 'modern-sans', title: 'Modern sans (compare)', description: 'Popular web fonts not in the app yet. Pick one here and we can add it.' },
  { id: 'serif', title: 'Serif & display', description: 'Editorial and accent styles.' },
  { id: 'system', title: 'System references', description: 'Built-in browser fonts.' },
];

export const FONT_PREVIEW_CATALOG: FontPreviewEntry[] = [
  ...APP_FONTS,
  ...SMART_LINK_FONTS.filter((f) => !APP_FONTS.some((a) => a.id === f.id)),
  ...MODERN_SANS_FONTS.filter(
    (f) => !SMART_LINK_FONTS.some((s) => s.id === f.id) && !APP_FONTS.some((a) => a.id === f.id)
  ),
  ...SERIF_FONTS.filter((f) => !SMART_LINK_FONTS.some((s) => s.id === f.id)),
  ...SYSTEM_FONTS,
];

export function googleFontsStylesheetUrls(entries: FontPreviewEntry[]): string[] {
  const params = [...new Set(entries.map((e) => e.googleParam).filter(Boolean))] as string[];
  const chunkSize = 12;
  const urls: string[] = [];
  for (let i = 0; i < params.length; i += chunkSize) {
    const chunk = params.slice(i, i + chunkSize);
    urls.push(`https://fonts.googleapis.com/css2?${chunk.map((p) => `family=${p}`).join('&')}&display=swap`);
  }
  return urls;
}

function googleParamForFamily(family: string): string | undefined {
  const primary = family.split(',')[0]?.replace(/"/g, '').trim();
  if (!primary || primary === 'system-ui') return undefined;
  const encoded = primary.replace(/ /g, '+');
  if (primary === 'Playfair Display') return 'Playfair+Display:wght@400;700';
  if (primary === 'Space Grotesk') return 'Space+Grotesk:wght@400;500;700';
  return `${encoded}:wght@400;500;700`;
}
