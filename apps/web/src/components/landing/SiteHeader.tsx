'use client';

import Link from 'next/link';
import Image from 'next/image';

export default function SiteHeader() {
  return (
    <header className="fixed top-0 left-0 right-0 z-50 border-b border-slate-800/80 bg-slate-950/90 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2.5 transition-opacity hover:opacity-90">
          <Image src="/logo.svg" alt="Agent4Socials" width={36} height={36} className="h-9 w-9" />
          <span className="text-xl font-bold tracking-tight text-white">Agent4Socials</span>
        </Link>
        <nav className="hidden items-center gap-8 md:flex">
          <Link href="/#features" className="text-sm font-medium text-slate-400 hover:text-white transition-colors">
            Features
          </Link>
          <Link href="/#product" className="text-sm font-medium text-slate-400 hover:text-white transition-colors">
            Product
          </Link>
          <Link href="/pricing" className="text-sm font-medium text-slate-400 hover:text-white transition-colors">
            Pricing
          </Link>
          <Link
            href="/login"
            className="text-sm font-medium text-slate-400 hover:text-white transition-colors"
          >
            Log in
          </Link>
          <Link
            href="/signup"
            className="rounded-xl bg-emerald-500 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-emerald-500/20 transition-all hover:bg-emerald-400 hover:shadow-emerald-500/30"
          >
            Start free
          </Link>
        </nav>
      </div>
    </header>
  );
}
