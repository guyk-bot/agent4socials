'use client';

import Link from 'next/link';
import { BRAND_CHROME_TEXT, BRAND_NAME, SITE_LOGO_DARK_SRC } from '@/lib/site-brand-assets';
import { useAuthModal } from '@/context/AuthModalContext';

export default function SiteFooter() {
  const { openLogin, openSignup } = useAuthModal();
  return (
    <footer className="funnel-footer border-t border-neutral-800 bg-black text-neutral-400">
      <div className="mx-auto max-w-6xl px-4 py-10 sm:py-14 sm:px-6">
        <div className="flex flex-col gap-8 sm:gap-10 md:flex-row md:items-start md:justify-between">
          <div className="flex items-center gap-2.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={SITE_LOGO_DARK_SRC} alt="" className="h-6 w-6 sm:h-7 sm:w-7 object-contain" />
            <span className="font-semibold text-sm sm:text-base" style={{ color: BRAND_CHROME_TEXT }}>
              {BRAND_NAME}
            </span>
          </div>
          <div className="grid gap-6 sm:gap-8 sm:grid-cols-3">
            <div>
              <h4 className="label text-neutral-500">Product</h4>
              <ul className="mt-4 space-y-3">
                <li><Link href="/#features" className="hover:text-[#A78BFA] transition-colors">Features</Link></li>
                <li><Link href="/pricing" className="hover:text-[#A78BFA] transition-colors">Pricing</Link></li>
                <li><Link href="/#product" className="hover:text-[#A78BFA] transition-colors">Product</Link></li>
                <li><Link href="/#how-it-works" className="hover:text-[#A78BFA] transition-colors">How it works</Link></li>
                <li><Link href="/#faq" className="hover:text-[#A78BFA] transition-colors">FAQ</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="label text-neutral-500">Company</h4>
              <ul className="mt-4 space-y-3">
                <li><button type="button" onClick={openSignup} className="hover:text-[#A78BFA] transition-colors">Sign up</button></li>
                <li><button type="button" onClick={openLogin} className="hover:text-[#A78BFA] transition-colors">Log in</button></li>
              </ul>
            </div>
            <div>
              <h4 className="label text-neutral-500">Legal</h4>
              <ul className="mt-4 space-y-3">
                <li><Link href="/privacy" className="hover:text-[#A78BFA] transition-colors">Privacy</Link></li>
                <li><Link href="/terms" className="hover:text-[#A78BFA] transition-colors">Terms</Link></li>
                <li><Link href="/data-deletion" className="hover:text-[#A78BFA] transition-colors">Data deletion</Link></li>
              </ul>
            </div>
          </div>
        </div>
        <div className="mt-12 border-t border-neutral-800 pt-8 text-center text-sm text-neutral-500">
          © {new Date().getFullYear()} {BRAND_NAME}. All rights reserved.
        </div>
      </div>
    </footer>
  );
}
