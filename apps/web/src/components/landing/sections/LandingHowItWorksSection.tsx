import { Brain, Link2, MessageCircle } from 'lucide-react';

const STEPS = [
  {
    num: '01',
    title: 'Connect your platforms',
    desc: 'Authorize iZop to your social accounts via official OAuth. No passwords stored. Takes under 60 seconds per platform.',
    Icon: Link2,
  },
  {
    num: '02',
    title: 'Tell iZop AI about your brand',
    desc: 'Share your brand name, voice, target audience and goals. iZop AI remembers everything and uses it in every response.',
    Icon: Brain,
  },
  {
    num: '03',
    title: 'Just ask — it handles the rest',
    desc: 'Schedule posts, reply to comments, pull analytics, extract leads — all by typing a message. No dashboards. No clicking around.',
    Icon: MessageCircle,
  },
];

export default function LandingHowItWorksSection() {
  return (
    <section id="how-it-works" className="landing-section landing-section--surface">
      <div className="landing-container">
        <div className="text-center max-w-2xl mx-auto mb-16">
          <h2 className="landing-heading">Up and running in 3 minutes</h2>
          <p className="landing-subheading mt-4">
            From signup to your first AI-powered social media action.
          </p>
        </div>
        <div className="relative grid gap-12 md:grid-cols-3 md:gap-8">
          <div
            className="hidden md:block absolute top-10 left-[20%] right-[20%] h-px border-t border-dashed border-[#2A2A38]"
            aria-hidden
          />
          {STEPS.map(({ num, title, desc, Icon }) => (
            <div key={num} className="relative flex flex-col items-center text-center z-10">
              <p className="text-[48px] font-bold leading-none text-[#AAFF45]">{num}</p>
              <div className="mt-4 flex h-14 w-14 items-center justify-center rounded-xl bg-[#1A1A24] border border-[#1E1E2A] text-[#7C3AED]">
                <Icon className="h-6 w-6" />
              </div>
              <h3 className="mt-5 text-lg font-semibold text-white">{title}</h3>
              <p className="mt-2 text-sm text-[#888780] leading-relaxed max-w-xs">{desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
