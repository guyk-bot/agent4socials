const EXAMPLES = [
  {
    user: 'Reply to all comments on my last Instagram post using my brand voice',
    izop: 'Done — replied to 847 comments in 4 minutes. 23 flagged as potential leads.',
    badge: 'Bulk Reply',
    color: '#AAFF45',
  },
  {
    user: 'Which of my TikTok videos performed best this month and why?',
    izop: 'Your March 14th video got 2.1M views — 3x your average. Short hook + trending audio + question in caption was the winning formula.',
    badge: 'Analytics',
    color: '#7C3AED',
  },
  {
    user: "Schedule 3 posts a week for the next month based on what's worked before",
    izop: 'Done — 12 posts scheduled across Instagram and TikTok. Best times selected automatically.',
    badge: 'Scheduling',
    color: '#0EA5E9',
  },
  {
    user: 'Send me a spreadsheet of leads from comments with AI DM suggestions',
    izop: 'Export ready — 34 leads identified, classified by intent, with personalized DM copy for each.',
    badge: 'Lead Extraction',
    color: '#AAFF45',
  },
  {
    user: 'Write 5 caption ideas for our summer sale in our brand voice',
    izop: 'Here are 5 captions optimized for engagement based on your top performing content style...',
    badge: 'Content Creation',
    color: '#7C3AED',
  },
  {
    user: 'How did my team perform this week? Who was most active?',
    izop: 'Maya posted 8 times, replied to 124 comments. Alex scheduled 6 posts. Full report attached.',
    badge: 'Team Reports',
    color: '#0EA5E9',
  },
];

export default function LandingAiInActionSection() {
  return (
    <section id="product" className="landing-section landing-section--void">
      <div className="landing-container">
        <div className="text-center max-w-2xl mx-auto mb-14">
          <h2 className="landing-heading">See iZop AI in action</h2>
          <p className="landing-subheading mt-4">Real examples of what you can ask</p>
        </div>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {EXAMPLES.map((ex) => (
            <div key={ex.user} className="landing-card landing-card--compact">
              <div className="landing-chat-pill">{ex.user}</div>
              <p className="mt-3 text-sm text-white leading-relaxed">{ex.izop}</p>
              <span
                className="landing-badge mt-4 inline-block"
                style={{
                  backgroundColor: `${ex.color}22`,
                  color: ex.color,
                  borderColor: `${ex.color}44`,
                }}
              >
                {ex.badge}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
