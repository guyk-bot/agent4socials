'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useAuthModal } from '@/context/AuthModalContext';

export default function SiteFooter() {
  const { openLogin, openSignup } = useAuthModal();
  return (
    <footer className="border-t border-[#efe7f7] bg-white text-[#5d5768]">
      <div className="mx-auto max-w-6xl px-4 py-10 sm:py-14 sm:px-6">
        <div className="flex flex-col gap-8 sm:gap-10 md:flex-row md:items-start md:justify-between">
          <div className="flex items-center gap-2.5">
            <Image src="/logo.svg" alt="Agent4Socials" width={28} height={28} className="h-6 w-6 sm:h-7 sm:w-7 object-contain [background:transparent]" />
            <span className="font-semibold text-[#1a161f] text-sm sm:text-base">Agent4Socials</span>
          </div>
          <div className="grid gap-6 sm:gap-8 sm:grid-cols-3">
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-[#8f7ca9]">Product</h4>
              <ul className="mt-4 space-y-3">
                <li><Link href="/#features" className="hover:text-[#6f2dbd] transition-colors">Features</Link></li>
                <li><Link href="/pricing" className="hover:text-[#6f2dbd] transition-colors">Pricing</Link></li>
                <li><Link href="/#product" className="hover:text-[#6f2dbd] transition-colors">Product</Link></li>
                <li><Link href="/#how-it-works" className="hover:text-[#6f2dbd] transition-colors">How it works</Link></li>
                <li><Link href="/#faq" className="hover:text-[#6f2dbd] transition-colors">FAQ</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-[#8f7ca9]">Company</h4>
              <ul className="mt-4 space-y-3">
                <li><button type="button" onClick={openSignup} className="hover:text-[#6f2dbd] transition-colors">Sign up</button></li>
                <li><button type="button" onClick={openLogin} className="hover:text-[#6f2dbd] transition-colors">Log in</button></li>
              </ul>
            </div>
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-[#8f7ca9]">Legal</h4>
              <ul className="mt-4 space-y-3">
                <li><Link href="/privacy" className="hover:text-[#6f2dbd] transition-colors">Privacy</Link></li>
                <li><Link href="/terms" className="hover:text-[#6f2dbd] transition-colors">Terms</Link></li>
                <li><Link href="/data-deletion" className="hover:text-[#6f2dbd] transition-colors">Data deletion</Link></li>
              </ul>
            </div>
          </div>
        </div>
        <div className="mt-12 border-t border-[#f3edf8] pt-8 text-center text-sm text-[#8f7ca9]">
          © {new Date().getFullYear()} Agent4Socials. All rights reserved.
        </div>
      </div>
    </footer>
  );
}
