import type { Metadata } from 'next';
import {
  Inter,
  Outfit,
  Poppins,
  Playfair_Display,
  Roboto,
  Montserrat,
  Space_Grotesk,
  Bebas_Neue,
} from 'next/font/google';
import Link from 'next/link';
import { satoshi } from '@/lib/fonts/satoshi';

export const metadata: Metadata = {
  title: 'Font preview (temporary)',
  robots: { index: false, follow: false },
};

const inter = Inter({ subsets: ['latin'], display: 'swap' });
const outfit = Outfit({ subsets: ['latin'], display: 'swap' });
const poppins = Poppins({ subsets: ['latin'], weight: ['400', '500', '700'], display: 'swap' });
const playfair = Playfair_Display({ subsets: ['latin'], weight: ['400', '700'], display: 'swap' });
const roboto = Roboto({ subsets: ['latin'], weight: ['400', '500', '700'], display: 'swap' });
const montserrat = Montserrat({ subsets: ['latin'], weight: ['400', '500', '700'], display: 'swap' });
const spaceGrotesk = Space_Grotesk({ subsets: ['latin'], weight: ['400', '500', '700'], display: 'swap' });
const bebasNeue = Bebas_Neue({ subsets: ['latin'], weight: '400', display: 'swap' });

const GREETING = "Hi 👋 I'm iZop,";
const HEADLINE = 'your personal AI social media manager.';
const BODY = "Tell me what platforms you're on, and I'll show you what I can do.";

type FontSample = {
  id: string;
  label: string;
  note?: string;
  className: string;
  weights?: Array<{ label: string; className: string }>;
};

const FONT_SAMPLES: FontSample[] = [
  {
    id: 'satoshi',
    label: 'Satoshi',
    note: 'Current app + funnel default',
    className: satoshi.className,
    weights: [
      { label: 'Regular 400', className: 'font-normal' },
      { label: 'Medium 500', className: 'font-medium' },
      { label: 'Bold 700', className: 'font-bold' },
      { label: 'Black 900', className: 'font-black' },
    ],
  },
  { id: 'inter', label: 'Inter', note: 'Previous app body font', className: inter.className },
  { id: 'outfit', label: 'Outfit', note: 'Previous app heading font', className: outfit.className },
  { id: 'poppins', label: 'Poppins', note: 'Smart Links option', className: poppins.className },
  { id: 'playfair', label: 'Playfair Display', note: 'Smart Links option (serif)', className: playfair.className },
  { id: 'roboto', label: 'Roboto', note: 'Smart Links option', className: roboto.className },
  { id: 'montserrat', label: 'Montserrat', note: 'Smart Links option', className: montserrat.className },
  { id: 'space-grotesk', label: 'Space Grotesk', note: 'Smart Links option', className: spaceGrotesk.className },
  { id: 'bebas-neue', label: 'Bebas Neue', note: 'Brand wordmark X styling only', className: bebasNeue.className },
  {
    id: 'system-ui',
    label: 'System UI',
    note: 'Browser default sans',
    className: 'font-sans',
  },
  {
    id: 'georgia',
    label: 'Georgia',
    note: 'System serif reference',
    className: '',
  },
];

function SampleBlock({ sample }: { sample: FontSample }) {
  const style = sample.id === 'georgia' ? { fontFamily: 'Georgia, serif' } : undefined;

  if (sample.weights) {
    return (
      <div className="space-y-4">
        {sample.weights.map((w) => (
          <div key={w.label} className={`${sample.className} ${w.className}`} style={style}>
            <p className="text-[10px] uppercase tracking-wide text-neutral-400 mb-1">{w.label}</p>
            <p className="text-2xl sm:text-3xl text-neutral-900">{GREETING}</p>
            <p className="mt-1 text-lg sm:text-xl text-neutral-700">{HEADLINE}</p>
            <p className="mt-2 text-sm text-neutral-500">{BODY}</p>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className={sample.className} style={style}>
      <p className="text-2xl sm:text-3xl text-neutral-900">{GREETING}</p>
      <p className="mt-1 text-lg sm:text-xl text-neutral-700">{HEADLINE}</p>
      <p className="mt-2 text-sm text-neutral-500">{BODY}</p>
    </div>
  );
}

export default function FontPreviewPage() {
  return (
    <div className="min-h-screen bg-[#F8F7FC] text-neutral-900">
      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
        <div className="mb-10 rounded-2xl border border-[#E8E6DF] bg-white p-6 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-[#7C3AED]">Temporary</p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight">Funnel chat font preview</h1>
          <p className="mt-2 text-sm text-neutral-600">
            Same copy as the landing chat hero. Compare fonts side by side. This page is not indexed and can be removed
            when you pick a winner.
          </p>
          <Link href="/" className="mt-4 inline-flex text-sm font-medium text-[#7C3AED] hover:underline">
            Back to funnel
          </Link>
        </div>

        <div className="space-y-6">
          {FONT_SAMPLES.map((sample) => (
            <section
              key={sample.id}
              className="rounded-2xl border border-[#E8E6DF] bg-white p-5 sm:p-6 shadow-sm"
            >
              <div className="mb-4 flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-neutral-100 pb-3">
                <h2 className="text-base font-semibold text-neutral-900">{sample.label}</h2>
                {sample.note ? <span className="text-xs text-neutral-500">{sample.note}</span> : null}
              </div>
              <SampleBlock sample={sample} />
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
