'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useState } from 'react';
import { Menu, X } from 'lucide-react';
import { useAuthModal } from '@/context/AuthModalContext';

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
    <header className="fixed top-0 left-0 right-0 z-50 border-b border-white/10 bg-[var(--dark)]/95 backdrop-blur-xl">
      <div className="mx-auto flex h-14 sm:h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2 sm:gap-2.5 transition-opacity hover:opacity-90 min-w-0">
          <Image src="/logo.svg" alt="Agent4Socials" width={36} height={36} className="h-8 w-8 sm:h-9 sm:w-9 shrink-0" />
          <span className="text-lg sm:text-xl font-bold tracking-tight text-white truncate">Agent4Socials</span>
        </Link>
        <nav className="hidden items-center gap-6 lg:gap-8 md:flex">
          {navLinks.map((link) => (
            <Link key={link.href} href={link.href} className="text-sm font-medium text-slate-400 hover:text-white transition-colors">
              {link.label}
            </Link>
          ))}
          <button type="button" onClick={openLogin} className="text-sm font-medium text-slate-400 hover:text-white transition-colors">
            Log in
          </button>
          <button
            type="button"
            onClick={openSignup}
            className="rounded-xl bg-[var(--primary)] px-4 py-2 sm:px-5 sm:py-2.5 text-sm font-semibold text-neutral-900 shadow-lg shadow-[0_0_20px_rgba(95,246,253,0.35)] transition-all hover:bg-[var(--primary-hover)] hover:shadow-[0_0_24px_rgba(95,246,253,0.45)]"
          >
            Try for free
          </button>
        </nav>
        <div className="flex items-center gap-2 md:hidden">
          <button
            type="button"
            onClick={openSignup}
            className="rounded-lg bg-[var(--primary)] px-3 py-2 text-sm font-semibold text-white hover:bg-[var(--primary-hover)]"
          >
            Try for free
          </button>
          <button
            type="button"
            onClick={() => setMobileOpen(!mobileOpen)}
            className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-white/10 transition-colors"
            aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
          >
            {mobileOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>
      </div>
      {mobileOpen && (
        <nav className="md:hidden border-t border-white/10 bg-[var(--dark)]/98 backdrop-blur-xl px-4 py-4 flex flex-col gap-1">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setMobileOpen(false)}
              className="py-3 px-3 rounded-lg text-slate-300 hover:text-white hover:bg-white/10/80 font-medium transition-colors"
            >
              {link.label}
            </Link>
          ))}
          <button
            type="button"
            onClick={() => { setMobileOpen(false); openLogin(); }}
            className="py-3 px-3 rounded-lg text-slate-300 hover:text-white hover:bg-white/10/80 font-medium transition-colors w-full text-left"
          >
            Log in
          </button>
          <button
            type="button"
            onClick={() => { setMobileOpen(false); openSignup(); }}
            className="mt-2 mx-3 py-3 rounded-xl bg-[var(--primary)] text-center font-semibold text-white w-full hover:bg-[var(--primary-hover)]"
          >
            Try for free
          </button>
        </nav>
      )}
    </header>
  );
}
