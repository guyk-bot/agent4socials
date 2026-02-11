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
    <header className="fixed top-0 left-0 right-0 z-50 border-b border-slate-800/80 bg-slate-950/95 backdrop-blur-xl">
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
            className="rounded-xl bg-emerald-500 px-4 py-2 sm:px-5 sm:py-2.5 text-sm font-semibold text-white shadow-lg shadow-emerald-500/20 transition-all hover:bg-emerald-400 hover:shadow-emerald-500/30"
          >
            7-day free trial
          </button>
        </nav>
        <div className="flex items-center gap-2 md:hidden">
          <button
            type="button"
            onClick={openSignup}
            className="rounded-lg bg-emerald-500 px-3 py-2 text-sm font-semibold text-white"
          >
            Free trial
          </button>
          <button
            type="button"
            onClick={() => setMobileOpen(!mobileOpen)}
            className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
            aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
          >
            {mobileOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>
      </div>
      {mobileOpen && (
        <nav className="md:hidden border-t border-slate-800/80 bg-slate-950/98 backdrop-blur-xl px-4 py-4 flex flex-col gap-1">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setMobileOpen(false)}
              className="py-3 px-3 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800/80 font-medium transition-colors"
            >
              {link.label}
            </Link>
          ))}
          <button
            type="button"
            onClick={() => { setMobileOpen(false); openLogin(); }}
            className="py-3 px-3 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800/80 font-medium transition-colors w-full text-left"
          >
            Log in
          </button>
          <button
            type="button"
            onClick={() => { setMobileOpen(false); openSignup(); }}
            className="mt-2 mx-3 py-3 rounded-xl bg-emerald-500 text-center font-semibold text-white w-full"
          >
            Start 7-day free trial
          </button>
        </nav>
      )}
    </header>
  );
}
