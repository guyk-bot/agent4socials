'use client';

import { useEffect } from 'react';
import SiteFooter from '@/components/landing/SiteFooter';
import SiteHeader from '@/components/landing/SiteHeader';
import ChatHero from '@/components/landing/ChatHero';
import LandingSocialProof from '@/components/landing/LandingSocialProof';
import Testimonials from '@/components/landing/Testimonials';
import LandingFeaturesSection from '@/components/landing/sections/LandingFeaturesSection';
import LandingHowItWorksSection from '@/components/landing/sections/LandingHowItWorksSection';
import LandingAiInActionSection from '@/components/landing/sections/LandingAiInActionSection';
import LandingPricingSection from '@/components/landing/sections/LandingPricingSection';
import LandingFaqSection from '@/components/landing/sections/LandingFaqSection';
import LandingFinalCtaSection from '@/components/landing/sections/LandingFinalCtaSection';

export default function Home() {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const { pathname, hash } = window.location;
    if (pathname === '/' && hash && hash.includes('access_token')) {
      window.location.replace('/auth/callback' + hash);
    }
  }, []);

  return (
    <div className="min-h-screen funnel-page landing-below-hero overflow-x-hidden">
      <SiteHeader />
      <main>
        <ChatHero />
        <LandingSocialProof />
        <LandingFeaturesSection />
        <LandingHowItWorksSection />
        <LandingAiInActionSection />
        <LandingPricingSection />
        <Testimonials />
        <LandingFaqSection />
        <LandingFinalCtaSection />
      </main>
      <SiteFooter />
    </div>
  );
}
