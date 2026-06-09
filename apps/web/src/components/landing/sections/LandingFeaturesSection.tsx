import { Calendar, BarChart3, Hash, MessageCircle, MessageSquare, Sparkles, Table2 } from 'lucide-react';

const CARDS = [
  {
    hero: true,
    icon: Sparkles,
    iconChar: '✦',
    useChar: true,
    title: 'iZop AI — Your social media brain',
    desc: 'Ask anything. Schedule posts, bulk reply to comments, extract leads, generate reports, brainstorm ideas — all through natural conversation. iZop AI knows your brand voice and never sleeps.',
  },
  {
    icon: MessageSquare,
    title: 'Bulk reply to comments & DMs',
    desc: 'Reply to hundreds of comments instantly with AI responses that match your exact brand voice. Works across Instagram, TikTok, YouTube and more.',
  },
  {
    icon: Table2,
    title: 'Extract leads from comments',
    desc: 'Turn every comment into a potential customer. iZop AI identifies leads, classifies them by intent, and exports a spreadsheet with AI-suggested DM copy.',
  },
  {
    icon: Calendar,
    title: 'Schedule across 8 platforms',
    desc: 'Plan content for Instagram, TikTok, YouTube, Facebook, X, LinkedIn, Threads and Pinterest from one calendar. Draft once, publish everywhere.',
  },
  {
    icon: BarChart3,
    title: 'Analytics that answer questions',
    desc: "Don't just see numbers — get answers. Ask 'which post performed best this month and why?' and get a plain-English breakdown instantly.",
  },
  {
    icon: MessageCircle,
    title: 'Unified inbox',
    desc: 'Every DM and comment from every platform in one feed. Never miss a message. Reply without switching apps.',
  },
  {
    icon: Hash,
    title: 'Hashtag pool',
    desc: 'Save your best hashtag sets and drop them into any post in one click. Never retype hashtags again.',
  },
];

export default function LandingFeaturesSection() {
  return (
    <section id="features" className="landing-section landing-section--void">
      <div className="landing-container">
        <div className="text-center max-w-3xl mx-auto mb-14">
          <p className="landing-eyebrow">WHAT iZOP AI CAN DO</p>
          <h2 className="landing-heading mt-3">One AI. Every platform. Total control.</h2>
          <p className="landing-subheading mt-4">
            Stop clicking through dashboards. Just tell iZop AI what you need.
          </p>
        </div>
        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {CARDS.map((card) => {
            const Icon = card.icon;
            return (
              <div
                key={card.title}
                className={`landing-card landing-card--hover group ${
                  card.hero ? 'md:col-span-2 lg:col-span-3 landing-card--hero' : ''
                }`}
              >
                <div className="landing-card__icon">
                  {card.useChar ? (
                    <span className="text-lg text-[#AAFF45]">{card.iconChar}</span>
                  ) : (
                    <Icon className="h-5 w-5 text-[#7C3AED]" />
                  )}
                </div>
                <h3 className="landing-card__title mt-4">{card.title}</h3>
                <p className="landing-card__body mt-2">{card.desc}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
