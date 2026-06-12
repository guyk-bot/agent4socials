import { SITE_LOGO_DARK_SRC, SITE_HEADER_LOGO_CLASS } from '@/lib/site-brand-assets';

type Props = {
  alt?: string;
  /** sm: header mark. md: slightly larger hero contexts. */
  size?: 'sm' | 'md';
  /** nav: inline with top nav icons (~18px). */
  variant?: 'full' | 'nav';
  className?: string;
};

const sizeClass = {
  sm: SITE_HEADER_LOGO_CLASS,
  md: 'h-8 w-8 sm:h-9 sm:w-9 shrink-0 object-contain',
} as const;

/** iZop brand mark (white Z + green dot on black). */
export function IzopGlassLogo({
  alt = 'iZop',
  size = 'sm',
  variant = 'full',
  className = '',
}: Props) {
  const boxClass = variant === 'nav' ? 'h-[18px] w-[18px] shrink-0 object-contain' : sizeClass[size];
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={SITE_LOGO_DARK_SRC}
      alt={alt}
      className={`${boxClass} ${className}`.trim()}
      draggable={false}
    />
  );
}
