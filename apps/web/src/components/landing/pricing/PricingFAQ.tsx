'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

const FAQ_ITEMS: { question: string; answer: string }[] = [
  {
    question: 'What is a brand?',
    answer: 'A brand represents one social media workspace with connected social accounts, inbox, analytics, and smart link page.',
  },
  {
    question: 'What counts as a scheduled post?',
    answer: 'The number of posts depends on how many platforms you schedule each piece of content to.',
  },
  {
    question: 'Can I add more brands later?',
    answer: 'Yes. Starter and Pro plans allow you to add more brands anytime.',
  },
  {
    question: 'Can I cancel anytime?',
    answer: 'Yes. You can cancel your subscription anytime.',
  },
  {
    question: 'Do smart link pages work like a link in bio page?',
    answer: 'Yes. Smart link pages let you create bio-link style pages for your content, campaigns, products, or clients.',
  },
  {
    question: 'What is included in the AI Assistant?',
    answer: 'The AI Assistant helps with content-related tasks inside the platform. Free includes limited use, while Starter and Pro include unlimited use.',
  },
  {
    question: 'What is the difference between Starter and Pro?',
    answer: 'Starter is designed for creators and freelancers who need more connections, unlimited scheduling, and exports. Pro adds advanced analytics, bulk replies, custom domains, white-label reports, and client dashboard features.',
  },
  {
    question: 'Is X (Twitter) included on the Free plan?',
    answer: 'No. X (Twitter) connection is available on Starter and Pro plans only. Free plan includes Instagram, Facebook, TikTok, YouTube, and LinkedIn. Upgrade to connect X (Twitter).',
  },
];

function FaqItem({ question, answer, isOpen, onToggle }: { question: string; answer: string; isOpen: boolean; onToggle: () => void }) {
  return (
    <div className="rounded-2xl border border-neutral-200 bg-white overflow-hidden transition-all duration-200 hover:border-neutral-300">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-4 p-5 sm:p-6 text-left"
        aria-expanded={isOpen}
      >
        <span className="font-semibold text-neutral-900 pr-4">{question}</span>
        {isOpen ? (
          <ChevronUp className="h-5 w-5 shrink-0 text-neutral-500" aria-hidden />
        ) : (
          <ChevronDown className="h-5 w-5 shrink-0 text-neutral-500" aria-hidden />
        )}
      </button>
      <div
        className={`overflow-hidden transition-all duration-300 ease-out ${
          isOpen ? 'max-h-[20rem] opacity-100' : 'max-h-0 opacity-0'
        }`}
      >
        <div className="border-t border-neutral-100 px-5 pb-5 pt-0 sm:px-6 sm:pb-6 sm:pt-0">
          <p className="text-neutral-600 text-sm sm:text-base leading-relaxed">{answer}</p>
        </div>
      </div>
    </div>
  );
}

export default function PricingFAQ() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <section className="py-16 sm:py-20">
      <div className="mx-auto max-w-3xl px-4 sm:px-6">
        <h2 className="text-center text-2xl font-bold text-neutral-900 sm:text-3xl">
          Frequently Asked Questions
        </h2>
        <div className="mt-10 space-y-3">
          {FAQ_ITEMS.map((item, i) => (
            <FaqItem
              key={i}
              question={item.question}
              answer={item.answer}
              isOpen={openIndex === i}
              onToggle={() => setOpenIndex(openIndex === i ? null : i)}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
