'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';

const FAQ_ITEMS = [
  {
    q: 'What can iZop AI actually do?',
    a: 'iZop AI is your AI social media manager. You can ask it to schedule posts, bulk reply to comments and DMs in your brand voice, extract leads from comments into a spreadsheet, generate analytics reports for any time period, brainstorm content ideas, track team performance, and much more — all through natural conversation.',
  },
  {
    q: 'Which platforms does iZop support?',
    a: 'iZop currently supports Instagram, TikTok, YouTube, Facebook, X (Twitter), LinkedIn, Threads, and Pinterest — 8 platforms in total.',
  },
  {
    q: 'Is there really a free plan?',
    a: "Yes — iZop's free plan includes 1 brand, 3 platforms, 30 scheduled posts per month, 30 days of analytics, and limited iZop AI usage. No credit card required to get started.",
  },
  {
    q: 'How does the bulk reply feature work?',
    a: "Connect your accounts, then tell iZop AI something like 'Reply to all comments on my last post using my brand voice.' iZop AI reads every comment, generates a personalized response for each one, and sends them all — in seconds.",
  },
  {
    q: 'How does lead extraction work?',
    a: "Ask iZop AI to 'send me a spreadsheet of leads from my recent comments.' It analyzes comments, identifies potential customers, classifies them by intent (high/medium/low), and exports a spreadsheet with AI-suggested DM copy for each lead.",
  },
  {
    q: 'Can I manage multiple brands or clients?',
    a: 'Yes — the Pro plan supports 3 brands and the Agency plan supports 10. Each brand has its own connected accounts, AI brand voice, analytics, and team access controls.',
  },
  {
    q: 'What happens when I hit my iZop AI limit?',
    a: "On the free plan you get 10 AI messages/month. On Starter you get 100. On Pro and Agency, iZop AI is unlimited. When you approach your limit you'll see a prompt to upgrade.",
  },
  {
    q: 'Is my data secure?',
    a: 'iZop connects to your social platforms via official OAuth — we never store your passwords. All data is encrypted in transit and at rest. We never sell or share your data.',
  },
  {
    q: 'Can I cancel anytime?',
    a: 'Yes — cancel anytime from your account settings with no questions asked. If you cancel a paid plan you keep access until the end of your billing period.',
  },
];

function FaqItem({ question, answer }: { question: string; answer: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-[#1E1E2A] last:border-0">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between gap-4 py-5 text-left"
      >
        <span className="text-base font-medium text-white">{question}</span>
        <ChevronDown
          className={`h-5 w-5 shrink-0 transition-transform duration-300 ${
            open ? 'rotate-180 text-[#AAFF45]' : 'text-[#888780]'
          }`}
        />
      </button>
      <div
        className={`overflow-hidden transition-all duration-300 ease-out ${
          open ? 'max-h-96 pb-5 opacity-100' : 'max-h-0 opacity-0'
        }`}
      >
        <p className="text-sm text-[#888780] leading-[1.7] pr-8">{answer}</p>
      </div>
    </div>
  );
}

export default function LandingFaqSection() {
  return (
    <section id="faq" className="landing-section landing-section--void">
      <div className="landing-container max-w-3xl">
        <div className="text-center mb-12">
          <h2 className="landing-heading">Frequently asked questions</h2>
        </div>
        <div>
          {FAQ_ITEMS.map((item) => (
            <FaqItem key={item.q} question={item.q} answer={item.a} />
          ))}
        </div>
      </div>
    </section>
  );
}
