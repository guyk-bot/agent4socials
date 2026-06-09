'use client';

import { useAuthModal } from '@/context/AuthModalContext';

export default function LandingFinalCtaSection() {
  const { openSignup } = useAuthModal();

  return (
    <section className="landing-section landing-section--surface landing-final-cta relative overflow-hidden">
      <div className="landing-final-cta__glow pointer-events-none absolute inset-0" aria-hidden />
      <div className="landing-container relative z-10 text-center max-w-3xl mx-auto">
        <h2 className="text-[36px] md:text-[56px] font-bold text-white leading-[1.1] tracking-[-1.5px]">
          Stop managing social media.
          <br />
          Start talking to it.
        </h2>
        <p className="mt-5 text-xl text-[#888780]">iZop AI handles the rest.</p>
        <button
          type="button"
          onClick={openSignup}
          className="mt-10 btn-funnel-lime-cta rounded-full px-8 py-4 text-base font-semibold"
        >
          Start for free — no credit card
        </button>
        <p className="mt-5 text-[13px] text-[#888780]">
          Free plan available · Upgrade anytime · Cancel anytime
        </p>
      </div>
    </section>
  );
}
