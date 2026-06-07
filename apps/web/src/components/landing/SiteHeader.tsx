'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useState } from 'react';
import { Menu, X } from 'lucide-react';
import { useAuthModal } from '@/context/AuthModalContext';
import { BrandWordmark } from '@/components/BrandWordmark';
import { BRAND_NAME, SITE_LOGO_PATH } from '@/lib/site-brand-assets';

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

  return (
    <>
      <div className="brand-gradient-bar fixed top-0 left-0 right-0 z-[60]" aria-hidden />
      <header className="fixed top-[6px] left-0 right-0 z-50 funnel-nav">
        <div className="mx-auto flex h-14 sm:h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2 sm:gap-2.5 transition-opacity hover:opacity-90 min-w-0">
            <Image
              src={SITE_LOGO_PATH}
              alt={BRAND_NAME}
              width={36}
              height={36}
              className="h-8 w-8 sm:h-9 sm:w-9 shrink-0 object-contain [background:transparent]"
            />
            <BrandWordmark name={BRAND_NAME} className="text-lg sm:text-xl font-semibold tracking-tight text-[var(--text-primary)] truncate" />
          </Link>
          <nav className="hidden items-center gap-6 lg:gap-8 md:flex">
            {navLinks.map((link) => (
              <Link key={link.href} href={link.href} className="text-sm font-medium text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors">
                {link.label}
              </Link>
            ))}
            <button type="button" onClick={openLogin} className="text-sm font-medium text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors">
              Log in
            </button>
            <button
              type="button"
              onClick={openSignup}
              className="rounded-full gradient-cta-pro px-5 py-2.5 text-sm font-semibold shadow-[0_10px_24px_rgba(124,58,237,0.28)] transition-all hover:scale-[1.02]"
            >
              Try for free
            </button>
          </nav>
          <div className="flex items-center gap-2 md:hidden">
            <button
              type="button"
              onClick={openSignup}
              className="rounded-full gradient-cta-pro px-4 py-2 text-sm font-semibold shadow-[0_10px_22px_rgba(124,58,237,0.26)]"
            >
              Try for free
            </button>
            <button
              type="button"
              onClick={() => setMobileOpen(!mobileOpen)}
              className="p-2 text-[var(--text-muted)] hover:text-[var(--text-primary)] rounded-lg hover:bg-[var(--bg-hover)] transition-colors"
              aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
            >
              {mobileOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </button>
          </div>
        </div>
        {mobileOpen && (
          <nav className="md:hidden border-t border-[var(--bg-border)] bg-[var(--bg-surface)] px-4 py-4 flex flex-col gap-1">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setMobileOpen(false)}
                className="py-3 px-3 rounded-xl text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] font-medium transition-colors"
              >
                {link.label}
              </Link>
            ))}
            <button
              type="button"
              onClick={() => { setMobileOpen(false); openLogin(); }}
              className="py-3 px-3 rounded-xl text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] font-medium transition-colors w-full text-left"
            >
              Log in
            </button>
            <button
              type="button"
              onClick={() => { setMobileOpen(false); openSignup(); }}
              className="mt-2 mx-3 py-3 rounded-full gradient-cta-pro text-center font-semibold w-full shadow-[0_10px_22px_rgba(124,58,237,0.26)]"
            >
              Try for free
            </button>
          </nav>
        )}
      </header>
    </>
  );
}
