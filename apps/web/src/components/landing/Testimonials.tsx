const TESTIMONIALS = [
  {
    initials: 'SM',
    color: '#7C3AED',
    name: 'Sarah M.',
    meta: '@sarahm.creates · 47K followers',
    role: 'Instagram creator',
    quote:
      "I asked iZop AI to pull everyone who commented 'link' on my last 10 posts and put them in a spreadsheet. It did it in seconds. That list turned into $3,400 in sales.",
  },
  {
    initials: 'JO',
    color: '#0EA5E9',
    name: 'James Okafor',
    meta: 'Social Media Manager, Bloom Studio',
    role: '',
    quote:
      'We manage 6 client accounts. Monday mornings used to be 3 hours of reports. Now I ask iZop AI and have branded PDFs for every client in minutes.',
  },
  {
    initials: 'PS',
    color: '#AAFF45',
    name: 'Priya Sharma',
    meta: '@priyacooks · 89K followers',
    role: 'Food creator',
    quote:
      'Got 400 comments on a Reel and replied to all of them in one click with messages that actually sounded like me. Engagement went up 34%.',
  },
  {
    initials: 'DT',
    color: '#F59E0B',
    name: 'Daniel Torres',
    meta: 'Founder, Coastline Apparel',
    role: '',
    quote:
      "I told iZop AI our brand voice once. Now every caption suggestion is spot on. It's like having a strategist on call 24/7.",
  },
  {
    initials: 'MK',
    color: '#EC4899',
    name: 'Michelle K.',
    meta: '@michellefitlife · 23K followers',
    role: '',
    quote:
      'Asked it which videos performed best this quarter and why. It gave me a full breakdown by platform and time of day. Restructured my entire content strategy.',
  },
  {
    initials: 'MW',
    color: '#6366F1',
    name: 'Marcus Webb',
    meta: 'Agency Owner, Webb Digital',
    role: '',
    quote:
      'My team of 4 uses iZop. I asked the AI how each person performed last month — got a full breakdown of who posted what, response times, engagement rates. First real performance review ever.',
  },
];

export default function Testimonials() {
  return (
    <section className="landing-section landing-section--void">
      <div className="landing-container">
        <div className="text-center max-w-2xl mx-auto mb-14">
          <h2 className="landing-heading">Loved by creators and agencies</h2>
          <p className="landing-subheading mt-4">
            Join thousands who&apos;ve replaced 5 tools with one conversation.
          </p>
        </div>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {TESTIMONIALS.map((t) => (
            <div key={t.name} className="landing-testimonial-card relative">
              <span className="landing-testimonial-quote-mark" aria-hidden>&ldquo;</span>
              <div className="flex items-center gap-3 relative z-10">
                <span
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold text-black"
                  style={{ backgroundColor: t.color }}
                >
                  {t.initials}
                </span>
                <div>
                  <p className="text-sm font-semibold text-white">{t.name}</p>
                  <p className="text-[13px] text-[#888780]">{t.meta}</p>
                  {t.role ? <p className="text-[12px] text-[#888780]">{t.role}</p> : null}
                </div>
              </div>
              <p className="mt-3 text-[#AAFF45] text-sm" aria-label="5 stars">
                ⭐⭐⭐⭐⭐
              </p>
              <p className="mt-3 text-sm text-white leading-relaxed relative z-10">{t.quote}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
