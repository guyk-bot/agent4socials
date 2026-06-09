'use client';

import Link from 'next/link';
import { Sun, Moon } from 'lucide-react';
import {
  InstagramIcon,
  LinkedinIcon,
  TikTokIcon,
  XTwitterIcon,
  YoutubeIcon,
} from '@/components/SocialPlatformIcons';
import { BRAND_NAME, SITE_LOGO_DARK_SRC } from '@/lib/site-brand-assets';
import { useTheme } from '@/context/ThemeContext';

const PRODUCT_LINKS = [
  { href: '/#features', label: 'Features' },
  { href: '/#pricing', label: 'Pricing' },
  { href: '/#how-it-works', label: 'How it works' },
  { href: '/#product', label: 'Product' },
  { href: '#', label: 'Changelog (coming soon)' },
];

const COMPANY_LINKS = [
  { href: '#', label: 'About' },
  { href: '#', label: 'Blog (coming soon)' },
  { href: '#', label: 'Careers (coming soon)' },
  { href: '#', label: 'Affiliates' },
  { href: '#', label: 'Contact' },
];

const LEGAL_LINKS = [
  { href: '/privacy', label: 'Privacy Policy' },
  { href: '/terms', label: 'Terms of Service' },
  { href: '/privacy', label: 'Cookie Policy' },
  { href: '/data-deletion', label: 'Data deletion' },
];

const SOCIAL_LINKS = [
  { href: 'https://instagram.com/izop', Icon: InstagramIcon, label: 'Instagram' },
  { href: 'https://tiktok.com/@izop', Icon: TikTokIcon, label: 'TikTok' },
  { href: 'https://x.com/izop', Icon: XTwitterIcon, label: 'X' },
  { href: 'https://linkedin.com/company/izop', Icon: LinkedinIcon, label: 'LinkedIn' },
  { href: 'https://youtube.com/@izop', Icon: YoutubeIcon, label: 'YouTube' },
];

export default function SiteFooter() {
  const { theme, toggleTheme } = useTheme();

  return (
    <footer className="landing-footer">
      <div className="landing-container pt-14 pb-10 md:pt-16">
        <div className="grid gap-10 md:grid-cols-2 lg:grid-cols-5">
          <div className="lg:col-span-2">
            <div className="flex items-center gap-2.5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={SITE_LOGO_DARK_SRC} alt="" className="h-7 w-7 object-contain" loading="lazy" />
              <span className="font-semibold text-white">{BRAND_NAME}</span>
            </div>
            <p className="mt-3 text-sm text-[#888780]">Your AI social media manager.</p>
            <div className="mt-5 flex flex-wrap items-center gap-3">
              {SOCIAL_LINKS.map(({ href, Icon, label }) => (
                <a
                  key={label}
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[#888780] hover:text-white transition-colors"
                  aria-label={label}
                >
                  <Icon size={20} />
                </a>
              ))}
            </div>
          </div>

          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-[#888780] mb-4">Product</h4>
            <ul className="space-y-3">
              {PRODUCT_LINKS.map((link) => (
                <li key={link.label}>
                  <Link href={link.href} className="landing-footer-link">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-[#888780] mb-4">Company</h4>
            <ul className="space-y-3">
              {COMPANY_LINKS.map((link) => (
                <li key={link.label}>
                  <Link href={link.href} className="landing-footer-link">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-[#888780] mb-4">Legal</h4>
            <ul className="space-y-3">
              {LEGAL_LINKS.map((link) => (
                <li key={link.label}>
                  <Link href={link.href} className="landing-footer-link">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      <div className="border-t border-[#1E1E2A]">
        <div className="landing-container flex flex-col sm:flex-row items-center justify-between gap-4 py-5">
          <p className="text-sm text-[#888780]">© {new Date().getFullYear()} {BRAND_NAME}. All rights reserved.</p>
          <button
            type="button"
            onClick={toggleTheme}
            className="inline-flex items-center gap-2 text-sm text-[#888780] hover:text-white transition-colors"
            aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {theme === 'dark' ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
            {theme === 'dark' ? 'Dark mode' : 'Light mode'}
          </button>
        </div>
      </div>
    </footer>
  );
}
