'use client';

import Link from 'next/link';
import Image from 'next/image';

export default function SiteFooter() {
  return (
    <footer className="border-t border-slate-800 bg-slate-900 text-slate-400">
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <div className="flex flex-col gap-8 md:flex-row md:items-start md:justify-between">
          <div className="flex items-center gap-2">
            <Image src="/logo.svg" alt="Agent4Socials" width={28} height={28} className="h-7 w-7" />
            <span className="font-semibold text-white">Agent4Socials</span>
          </div>
          <div className="grid gap-6 sm:grid-cols-3">
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500">Product</h4>
              <ul className="mt-3 space-y-2">
                <li><Link href="/#features" className="hover:text-white transition-colors">Features</Link></li>
                <li><Link href="/pricing" className="hover:text-white transition-colors">Pricing</Link></li>
                <li><Link href="/#product" className="hover:text-white transition-colors">Schedule & AI</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500">Company</h4>
              <ul className="mt-3 space-y-2">
                <li><Link href="/signup" className="hover:text-white transition-colors">Sign up</Link></li>
                <li><Link href="/login" className="hover:text-white transition-colors">Log in</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500">Legal</h4>
              <ul className="mt-3 space-y-2">
                <li><Link href="/privacy" className="hover:text-white transition-colors">Privacy</Link></li>
                <li><Link href="/terms" className="hover:text-white transition-colors">Terms</Link></li>
              </ul>
            </div>
          </div>
        </div>
        <div className="mt-10 border-t border-slate-800 pt-8 text-center text-sm text-slate-500">
          © {new Date().getFullYear()} Agent4Socials. All rights reserved.
        </div>
      </div>
    </footer>
  );
}
