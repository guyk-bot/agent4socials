'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useAuthModal } from '@/context/AuthModalContext';

export default function SiteFooter() {
  const { openLogin, openSignup } = useAuthModal();
  return (
    <footer className="border-t border-white/[0.08] bg-[#0b0f1a] text-[#9ca3af]">
      <div className="mx-auto max-w-6xl px-4 py-10 sm:py-14 sm:px-6">
        <div className="flex flex-col gap-8 sm:gap-10 md:flex-row md:items-start md:justify-between">
          <div className="flex items-center gap-2.5">
            <Image src="/favicon.svg" alt="Agent4Socials" width={28} height={28} className="h-6 w-6 sm:h-7 sm:w-7 object-contain [background:transparent]" />
            <span className="font-semibold text-white text-sm sm:text-base">Agent4Socials</span>
          </div>
          <div className="grid gap-6 sm:gap-8 sm:grid-cols-3">
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-[#6b7280]">Product</h4>
              <ul className="mt-4 space-y-3">
                <li><Link href="/#features" className="hover:text-white transition-colors">Features</Link></li>
                <li><Link href="/pricing" className="hover:text-white transition-colors">Pricing</Link></li>
                <li><Link href="/#product" className="hover:text-white transition-colors">Product</Link></li>
                <li><Link href="/#how-it-works" className="hover:text-white transition-colors">How it works</Link></li>
                <li><Link href="/#faq" className="hover:text-white transition-colors">FAQ</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-[#6b7280]">Company</h4>
              <ul className="mt-4 space-y-3">
                <li><button type="button" onClick={openSignup} className="hover:text-white transition-colors">Sign up</button></li>
                <li><button type="button" onClick={openLogin} className="hover:text-white transition-colors">Log in</button></li>
              </ul>
            </div>
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-[#6b7280]">Legal</h4>
              <ul className="mt-4 space-y-3">
                <li><Link href="/privacy" className="hover:text-white transition-colors">Privacy</Link></li>
                <li><Link href="/terms" className="hover:text-white transition-colors">Terms</Link></li>
                <li><Link href="/data-deletion" className="hover:text-white transition-colors">Data deletion</Link></li>
              </ul>
            </div>
          </div>
        </div>
        <div className="mt-12 border-t border-white/[0.06] pt-8 text-center text-sm text-[#6b7280]">
          © {new Date().getFullYear()} Agent4Socials. All rights reserved.
        </div>
      </div>
    </footer>
  );
}
