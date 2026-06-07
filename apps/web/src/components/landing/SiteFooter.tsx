'use client';

import Link from 'next/link';
import Image from 'next/image';
import { BRAND_NAME, SITE_LOGO_PATH } from '@/lib/site-brand-assets';
import { useAuthModal } from '@/context/AuthModalContext';

export default function SiteFooter() {
  const { openLogin, openSignup } = useAuthModal();
  return (
    <footer className="border-t border-[var(--bg-border)] bg-[var(--bg-surface)] text-[var(--text-muted)]">
      <div className="mx-auto max-w-6xl px-4 py-10 sm:py-14 sm:px-6">
        <div className="flex flex-col gap-8 sm:gap-10 md:flex-row md:items-start md:justify-between">
          <div className="flex items-center gap-2.5">
            <Image src={SITE_LOGO_PATH} alt={BRAND_NAME} width={28} height={28} className="h-6 w-6 sm:h-7 sm:w-7 object-contain [background:transparent]" />
            <span className="font-semibold text-[var(--text-primary)] text-sm sm:text-base">{BRAND_NAME}</span>
          </div>
          <div className="grid gap-6 sm:gap-8 sm:grid-cols-3">
            <div>
              <h4 className="label text-[var(--text-muted)]">Product</h4>
              <ul className="mt-4 space-y-3">
                <li><Link href="/#features" className="hover:text-[#7C3AED] transition-colors">Features</Link></li>
                <li><Link href="/pricing" className="hover:text-[#7C3AED] transition-colors">Pricing</Link></li>
                <li><Link href="/#product" className="hover:text-[#7C3AED] transition-colors">Product</Link></li>
                <li><Link href="/#how-it-works" className="hover:text-[#7C3AED] transition-colors">How it works</Link></li>
                <li><Link href="/#faq" className="hover:text-[#7C3AED] transition-colors">FAQ</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="label text-[var(--text-muted)]">Company</h4>
              <ul className="mt-4 space-y-3">
                <li><button type="button" onClick={openSignup} className="hover:text-[#7C3AED] transition-colors">Sign up</button></li>
                <li><button type="button" onClick={openLogin} className="hover:text-[#7C3AED] transition-colors">Log in</button></li>
              </ul>
            </div>
            <div>
              <h4 className="label text-[var(--text-muted)]">Legal</h4>
              <ul className="mt-4 space-y-3">
                <li><Link href="/privacy" className="hover:text-[#7C3AED] transition-colors">Privacy</Link></li>
                <li><Link href="/terms" className="hover:text-[#7C3AED] transition-colors">Terms</Link></li>
                <li><Link href="/data-deletion" className="hover:text-[#7C3AED] transition-colors">Data deletion</Link></li>
              </ul>
            </div>
          </div>
        </div>
        <div className="mt-12 border-t border-[var(--bg-border)] pt-8 text-center text-sm text-[var(--text-muted)]">
          © {new Date().getFullYear()} {BRAND_NAME}. All rights reserved.
        </div>
      </div>
    </footer>
  );
}
