import { NICHE_KEYWORDS } from './niche-keywords';

/** Dashboard section order and labels (must match product spec). */
export const TREND_CATEGORY_ORDER = [
  { id: 'ai_automation', label: 'AI & Automation' },
  { id: 'wealth_finance', label: 'Wealth & Finance' },
  { id: 'mystery_crime', label: 'Mystery & True Crime' },
  { id: 'self_improvement', label: 'Self-Improvement & Psychology' },
  { id: 'science_tech', label: 'Science & Tech' },
  { id: 'history_culture', label: 'History & Culture' },
  { id: 'lifestyle_travel', label: 'Lifestyle & Travel' },
  { id: 'health_wellness', label: 'Health & Wellness' },
  { id: 'business_productivity', label: 'Business & Productivity' },
  { id: 'news_global', label: 'News & Global Economics' },
] as const;

export type TrendCategoryId = (typeof TREND_CATEGORY_ORDER)[number]['id'];

/** Maps each YouTube search phrase (DB niche_name) to a dashboard category. */
export const NICHE_NAME_TO_CATEGORY: Record<string, TrendCategoryId> = {
  'Rare animals AI': 'ai_automation',
  'Extinct animals AI': 'ai_automation',
  'Bizarre nature facts': 'mystery_crime',
  'Deep sea creatures AI': 'ai_automation',
  'Prehistoric monsters': 'history_culture',
  'Animal hybrids': 'science_tech',
  'Passive income AI 2026': 'wealth_finance',
  'Side hustle case study': 'wealth_finance',
  'YouTube Automation': 'ai_automation',
  'Affiliate marketing 2026': 'wealth_finance',
  'Unsolved mysteries': 'mystery_crime',
  'True crime stories': 'mystery_crime',
  'Reddit horror stories': 'mystery_crime',
  'SCARY AI stories': 'ai_automation',
  'Sora AI news': 'ai_automation',
  'Kling AI vs Runway': 'ai_automation',
  'ChatGPT secrets': 'ai_automation',
  'Stoicism for 2026': 'self_improvement',
  'Dopamine detox': 'self_improvement',
  'Biohacking focus': 'self_improvement',
  'Mars colony update': 'news_global',
  'Quantum computing simplified': 'science_tech',
  'Future of work 2026': 'news_global',
  'Digital Nomad life Spain': 'lifestyle_travel',
  'Moving abroad 2026': 'lifestyle_travel',
  'Minimalist lifestyle hacks': 'lifestyle_travel',
  'Ancient civilizations mystery': 'history_culture',
  'Lost empires history': 'history_culture',
  'Midjourney prompt tips': 'ai_automation',
  'SaaS founder journey': 'business_productivity',
  'Crypto macro 2026': 'news_global',
  'Index fund vs stock picking': 'news_global',
  'Real estate investing beginners': 'wealth_finance',
  'Etsy print on demand 2026': 'wealth_finance',
  'Amazon FBA update 2026': 'wealth_finance',
  'Drop shipping honest review': 'wealth_finance',
  'Day trading psychology': 'wealth_finance',
  'Credit score hacks 2026': 'wealth_finance',
  'Van life budget Europe': 'lifestyle_travel',
  'Japan travel hidden gems': 'lifestyle_travel',
  'Korean skincare routine science': 'health_wellness',
  'Meal prep high protein': 'health_wellness',
  'Gut health microbiome': 'health_wellness',
  'Zone 2 cardio benefits': 'health_wellness',
  'Cold plunge research': 'health_wellness',
  'Longevity diet 2026': 'health_wellness',
  'Carnivore vs vegan debate': 'health_wellness',
  'Home gym setup budget': 'health_wellness',
  'Pickleball strategy tips': 'health_wellness',
  'Electric vehicle road trip': 'science_tech',
  'Smart home automation DIY': 'ai_automation',
  'Cybersecurity news 2026': 'news_global',
  'Open source AI models': 'ai_automation',
  'Apple Vision Pro apps': 'ai_automation',
  'SpaceX Starship update': 'news_global',
  'James Webb discoveries': 'news_global',
  'Fusion energy breakthrough': 'news_global',
  'CRISPR news 2026': 'news_global',
  'Electric plane startup': 'news_global',
  'Underwater archaeology': 'history_culture',
  'Pyramid construction theories': 'mystery_crime',
  'Viking history documentary': 'history_culture',
  'Roman empire daily life': 'history_culture',
  'AI voice clone ethics': 'ai_automation',
  'Deepfake detection tools': 'ai_automation',
  'NVIDIA AI chip news': 'ai_automation',
  'Robotaxi update 2026': 'ai_automation',
  'Drone delivery cities': 'science_tech',
  '3D printed homes': 'science_tech',
  'Vertical farming startup': 'science_tech',
  'Lab grown meat taste test': 'science_tech',
  'Fermentation recipes beginner': 'lifestyle_travel',
  'Sourdough science tips': 'lifestyle_travel',
  'Espresso at home budget': 'lifestyle_travel',
  'Wine tasting for beginners': 'lifestyle_travel',
  'Whisky investing 2026': 'wealth_finance',
  'Thrift flip furniture': 'lifestyle_travel',
  'Capsule wardrobe men': 'lifestyle_travel',
  'Slow fashion brands 2026': 'lifestyle_travel',
  'Indoor plants low light': 'lifestyle_travel',
  'Urban gardening balcony': 'lifestyle_travel',
  'Overlanding Africa route': 'lifestyle_travel',
  'Camper van electrical setup': 'lifestyle_travel',
  'Scuba diving best spots': 'lifestyle_travel',
  'Skiing Japan powder': 'lifestyle_travel',
  'Marathon training week': 'health_wellness',
  'Rock climbing finger strength': 'health_wellness',
  'Tennis serve technique slow': 'health_wellness',
  'Golf swing fix amateur': 'health_wellness',
  'Chess opening traps 2026': 'business_productivity',
  'Speedcubing world record': 'business_productivity',
  'LEGO investing sealed': 'wealth_finance',
  'Vintage watch collecting': 'wealth_finance',
  'Mechanical keyboard build': 'business_productivity',
  'PC building mistakes 2026': 'business_productivity',
  'Steam Deck emulation guide': 'business_productivity',
  'Indie game dev journey': 'business_productivity',
  'Blender tutorial beginner 2026': 'business_productivity',
};

function assertAllKeywordsMapped() {
  if (process.env.NODE_ENV !== 'production') {
    for (const k of NICHE_KEYWORDS) {
      if (!NICHE_NAME_TO_CATEGORY[k]) {
        console.warn('[niche-category-map] Missing category for keyword:', k);
      }
    }
  }
}
assertAllKeywordsMapped();

export function categoryIdForNicheName(nicheName: string): TrendCategoryId {
  return NICHE_NAME_TO_CATEGORY[nicheName] ?? 'science_tech';
}

const DAY_MS = 24 * 60 * 60 * 1000;

export type TrendOutlierLike = {
  id: string;
  nicheName: string;
  performanceRatio: number;
  lastUpdated: string;
};

/** Prefer rows updated in the last 24h, then fill by performance ratio for the top strip. */
export function rankForCategorySection<T extends TrendOutlierLike>(items: T[]): T[] {
  const now = Date.now();
  const inWindow = items.filter((i) => {
    const t = new Date(i.lastUpdated).getTime();
    return Number.isFinite(t) && now - t <= DAY_MS;
  });
  const sortByRatio = (a: T, b: T) => b.performanceRatio - a.performanceRatio;
  inWindow.sort(sortByRatio);
  const inSet = new Set(inWindow.map((x) => x.id));
  const rest = items.filter((i) => !inSet.has(i.id)).sort(sortByRatio);
  const seen = new Set<string>();
  const out: T[] = [];
  for (const i of [...inWindow, ...rest]) {
    if (seen.has(i.id)) continue;
    seen.add(i.id);
    out.push(i);
  }
  return out;
}
