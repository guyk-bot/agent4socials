'use client';

import Link from 'next/link';
import { useState } from 'react';
import { usePathname } from 'next/navigation';
import { Menu, X } from 'lucide-react';
import { useAuthModal } from '@/context/AuthModalContext';
import { BrandWordmark } from '@/components/BrandWordmark';
import { IzopGlassLogo } from '@/components/IzopGlassLogo';
import { BRAND_NAME } from '@/lib/site-brand-assets';
import { trackProductEvent } from '@/lib/product-analytics';
import { scrollToLandingSection } from '@/lib/landing-section-scroll';

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
    const isPricing = href.includes('pricing') && pathname === '/pricing';
    const isActive = isPricing;
    return `funnel-nav-link rounded-lg px-2 py-1.5 text-sm font-medium transition-colors ${isActive ? 'is-active' : ''}`;
  };

  const handleSectionNavClick = (
    event: React.MouseEvent<HTMLAnchorElement>,
    href: string,
    analyticsSource: string
  ) => {
    const hashIndex = href.indexOf('#');
    if (hashIndex < 0) return;

    const hash = href.slice(hashIndex);
    if (pathname === '/') {
      event.preventDefault();
      if (window.location.hash !== hash) {
        window.history.pushState(null, '', hash);
      }
      scrollToLandingSection(hash, 'smooth');
    }

    if (hash.includes('pricing')) {
      trackProductEvent('nav_pricing_clicked', { source: analyticsSource });
    }
  };

  return (
    <>
      <header className="fixed top-0 left-0 right-0 z-50 funnel-nav">
        <div className="mx-auto flex h-14 sm:h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2 sm:gap-2.5 transition-opacity hover:opacity-90 min-w-0">
            <IzopGlassLogo alt={BRAND_NAME} size="sm" />
            <BrandWordmark
              name={BRAND_NAME}
              className="funnel-nav-wordmark text-base sm:text-lg font-semibold tracking-tight truncate"
            />
          </Link>
          <nav className="hidden items-center gap-5 lg:gap-7 md:flex">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={navLinkClass(link.href)}
                onClick={(event) => handleSectionNavClick(event, link.href, 'header_desktop')}
              >
                {link.label}
              </Link>
            ))}
            <button
              type="button"
              onClick={() => openLogin('header_desktop')}
              className="funnel-nav-link rounded-lg px-2 py-1.5 text-sm font-medium transition-colors"
            >
              Log in
            </button>
            <button
              type="button"
              onClick={() => openSignup('header_desktop_try_free')}
              className="rounded-full btn-funnel-lime-cta px-5 py-2.5 text-sm font-semibold"
            >
              Try for free
            </button>
          </nav>
          <div className="flex items-center gap-2 md:hidden">
            <button
              type="button"
              onClick={() => openSignup('header_mobile_try_free')}
              className="rounded-full btn-funnel-lime-cta px-4 py-2 text-sm font-semibold"
            >
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
                onClick={(event) => {
                  setMobileOpen(false);
                  handleSectionNavClick(event, link.href, 'header_mobile');
                }}
                className={`${navLinkClass(link.href)} py-3 px-3`}
              >
                {link.label}
              </Link>
            ))}
            <button
              type="button"
              onClick={() => { setMobileOpen(false); openLogin('header_mobile'); }}
              className="funnel-nav-link py-3 px-3 rounded-xl font-medium transition-colors w-full text-left"
            >
              Log in
            </button>
            <button
              type="button"
              onClick={() => { setMobileOpen(false); openSignup('header_mobile_try_free'); }}
              className="btn-funnel-lime-cta mx-3 mt-2 w-full rounded-full py-3 text-center font-semibold"
            >
              Try for free
            </button>
          </nav>
        )}
      </header>
    </>
  );
}
