'use client';

import Link from 'next/link';
import { useState } from 'react';
import { usePathname } from 'next/navigation';
import { Menu, X } from 'lucide-react';
import { useAuthModal } from '@/context/AuthModalContext';
import { BrandWordmark } from '@/components/BrandWordmark';
import { BRAND_NAME, SITE_LOGO_DARK_SRC } from '@/lib/site-brand-assets';
import LandingGradientBar from '@/components/landing/LandingGradientBar';

const navLinks = [
  { href: '/#features', label: 'Features' },
  { href: '/#how-it-works', label: 'How it works' },
  { href: '/#product', label: 'Product' },
  { href: '/#faq', label: 'FAQ' },
  { href: '/#pricing', label: 'Pricing' },
];

export default function SiteHeader() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { openLogin, openSignup } = useAuthModal();
  const pathname = usePathname();

  const navLinkClass = (href: string) => {
    const isPricing = href === '/#pricing' && pathname === '/pricing';
    return `funnel-nav-link rounded-lg px-2 py-1.5 text-sm font-medium transition-colors ${isPricing ? 'is-active' : ''}`;
  };

  const logoSrc = SITE_LOGO_DARK_SRC;

  return (
    <>
      <LandingGradientBar />
      <header className="fixed top-[3px] left-0 right-0 z-50 funnel-nav">
        <div className="mx-auto flex h-14 sm:h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2 sm:gap-2.5 transition-opacity hover:opacity-90 min-w-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={logoSrc}
              alt={BRAND_NAME}
              className="h-6 w-6 sm:h-7 sm:w-7 shrink-0 object-contain"
            />
            <BrandWordmark
              name={BRAND_NAME}
              className="funnel-nav-wordmark text-base sm:text-lg font-semibold tracking-tight truncate"
            />
          </Link>
          <nav className="hidden items-center gap-5 lg:gap-6 md:flex">
            {navLinks.map((link) => (
              <Link key={link.href} href={link.href} className={navLinkClass(link.href)}>
                {link.label}
              </Link>
            ))}
            <button
              type="button"
              onClick={openLogin}
              className="funnel-nav-link rounded-lg px-2 py-1.5 text-sm font-medium transition-colors"
            >
              Log in
            </button>
            <button type="button" onClick={openSignup} className="btn-funnel-lime-cta rounded-full px-[22px] py-[10px] text-sm font-semibold">
              Try for free
            </button>
          </nav>
          <div className="flex items-center gap-2 md:hidden">
            <button type="button" onClick={openSignup} className="btn-funnel-lime-cta rounded-full px-4 py-2 text-sm font-semibold">
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
              className="mt-2 mx-3 py-3 text-center font-semibold w-full btn-funnel-lime-cta rounded-full"
            >
              Try for free
            </button>
          </nav>
        )}
      </header>
    </>
  );
}
