'use client';

import Link from 'next/link';
import { useState } from 'react';
import { usePathname } from 'next/navigation';
import { Menu, X, Sun, Moon } from 'lucide-react';
import { useAuthModal } from '@/context/AuthModalContext';
import { useTheme } from '@/context/ThemeContext';
import { BrandWordmark } from '@/components/BrandWordmark';
import { BRAND_NAME, SITE_LOGO_DARK_SRC } from '@/lib/site-brand-assets';
import { FUNNEL_LANDING_EXPERIMENTAL } from '@/components/landing/funnel-demos/funnel-landing-variant';

const navLinks = [
  { href: '/#features', label: 'Features' },
  { href: '/#how-it-works', label: 'How it works' },
  { href: '/#product', label: 'Product' },
  { href: '/#faq', label: 'FAQ' },
  { href: '/pricing', label: 'Pricing' },
];

export default function SiteHeader() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { openLogin, openSignup } = useAuthModal();
  const { theme, toggleTheme } = useTheme();
  const pathname = usePathname();
  const ctaClass = FUNNEL_LANDING_EXPERIMENTAL
    ? 'rounded-full btn-funnel-lime-cta px-5 py-2.5 text-sm font-semibold transition-all'
    : 'rounded-full gradient-cta-pro px-5 py-2.5 text-sm font-semibold text-white shadow-[0_10px_24px_rgba(124,58,237,0.28)] transition-all hover:scale-[1.02]';
  const ctaClassMobile = FUNNEL_LANDING_EXPERIMENTAL
    ? 'rounded-full btn-funnel-lime-cta px-4 py-2 text-sm font-semibold transition-all'
    : 'rounded-full gradient-cta-pro px-4 py-2 text-sm font-semibold text-white shadow-[0_10px_22px_rgba(124,58,237,0.26)]';

  const navLinkClass = (href: string) => {
    const isPricing = href === '/pricing' && pathname === '/pricing';
    const isActive = isPricing;
    return `funnel-nav-link rounded-lg px-2 py-1.5 text-sm font-medium transition-colors ${isActive ? 'is-active' : ''}`;
  };

  return (
    <>
      <header className="fixed top-0 left-0 right-0 z-50 funnel-nav">
        <div className="mx-auto flex h-14 sm:h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2 sm:gap-2.5 transition-opacity hover:opacity-90 min-w-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={SITE_LOGO_DARK_SRC}
              alt={BRAND_NAME}
              className="h-6 w-6 sm:h-7 sm:w-7 shrink-0 object-contain"
            />
            <BrandWordmark
              name={BRAND_NAME}
              className="funnel-nav-wordmark text-base sm:text-lg font-semibold tracking-tight truncate"
            />
          </Link>
          <nav className="hidden items-center gap-5 lg:gap-7 md:flex">
            {navLinks.map((link) => (
              <Link key={link.href} href={link.href} className={navLinkClass(link.href)}>
                {link.label}
              </Link>
            ))}
            {!FUNNEL_LANDING_EXPERIMENTAL ? (
              <button
                type="button"
                onClick={toggleTheme}
                className="funnel-nav-link inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium transition-colors"
                aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              >
                {theme === 'dark' ? <Sun className="h-4 w-4 shrink-0" /> : <Moon className="h-4 w-4 shrink-0" />}
                <span className="hidden lg:inline">{theme === 'dark' ? 'Light' : 'Dark'}</span>
              </button>
            ) : null}
            <button type="button" onClick={openLogin} className="funnel-nav-link rounded-lg px-2 py-1.5 text-sm font-medium transition-colors">
              Log in
            </button>
            <button type="button" onClick={openSignup} className={ctaClass}>
              Try for free
            </button>
          </nav>
          <div className="flex items-center gap-2 md:hidden">
            {!FUNNEL_LANDING_EXPERIMENTAL ? (
              <button
                type="button"
                onClick={toggleTheme}
                className="funnel-nav-link rounded-lg p-2 transition-colors"
                aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              >
                {theme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
              </button>
            ) : null}
            <button type="button" onClick={openSignup} className={ctaClassMobile}>
              Try for free
            </button>
            <button
              type="button"
              onClick={() => setMobileOpen(!mobileOpen)}
              className="funnel-nav-link rounded-lg p-2 transition-colors"
              aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
            >
              {mobileOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </button>
          </div>
        </div>
        {mobileOpen && (
          <nav className="funnel-nav-mobile-panel md:hidden border-t px-4 py-4 flex flex-col gap-1">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setMobileOpen(false)}
                className={`${navLinkClass(link.href)} py-3 px-3`}
              >
                {link.label}
              </Link>
            ))}
            {!FUNNEL_LANDING_EXPERIMENTAL ? (
              <button
                type="button"
                onClick={() => { setMobileOpen(false); toggleTheme(); }}
                className="funnel-nav-link inline-flex items-center gap-2 py-3 px-3 rounded-xl font-medium transition-colors w-full text-left"
              >
                {theme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
                {theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => { setMobileOpen(false); openLogin(); }}
              className="funnel-nav-link py-3 px-3 rounded-xl font-medium transition-colors w-full text-left"
            >
              Log in
            </button>
            <button
              type="button"
              onClick={() => { setMobileOpen(false); openSignup(); }}
              className={`mt-2 mx-3 py-3 text-center font-semibold w-full ${FUNNEL_LANDING_EXPERIMENTAL ? 'btn-funnel-lime-cta rounded-full' : 'rounded-full gradient-cta-pro text-white shadow-[0_10px_22px_rgba(124,58,237,0.26)]'}`}
            >
              Try for free
            </button>
          </nav>
        )}
      </header>
    </>
  );
}
