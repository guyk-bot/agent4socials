import { Star, ArrowRight } from 'lucide-react';
import Image from 'next/image';

const testimonials = [
  {
    name: 'Sarah Jenkins',
    role: 'Lifestyle Creator',
    handle: '@sarahstyle',
    content: "Agent4Socials completely changed my workflow. I used to spend hours every Sunday scheduling posts. Now it takes me 20 minutes.",
    avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&q=80&w=150&h=150',
  },
  {
    name: 'Marcus Chen',
    role: 'Tech Reviewer',
    handle: '@techmarcus',
    content: "The analytics are actually useful. I can see which platform is driving the most growth without logging into 5 different apps.",
    avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&q=80&w=150&h=150',
  },
  {
    name: 'Elena Rodriguez',
    role: 'Small Business Owner',
    handle: '@elenasbakery',
    content: "Simple, affordable, and just works. Exactly what I needed for my bakery's Instagram and Facebook pages.",
    avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=150&h=150',
  },
  {
    name: 'David Kim',
    role: 'Fitness Coach',
    handle: '@coachkim',
    content: "I love the calendar view. It makes planning my content strategy so much easier visually.",
    avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&q=80&w=150&h=150',
  },
];

export default function Testimonials() {
  return (
    <section className="py-24 sm:py-32 bg-slate-950 border-t border-slate-800/50 relative overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-emerald-900/10 via-slate-950 to-slate-950 pointer-events-none" />
      
      <div className="mx-auto max-w-7xl px-6 lg:px-8 relative z-10">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
            Loved by creators and businesses
          </h2>
          <p className="mt-6 text-lg leading-8 text-slate-400">
            Join thousands who trust Agent4Socials to manage their online presence.
          </p>
        </div>
        
        <div className="mx-auto mt-16 grid max-w-2xl grid-cols-1 grid-rows-1 gap-8 text-sm leading-6 text-slate-300 sm:mt-20 sm:grid-cols-2 xl:mx-0 xl:max-w-none xl:grid-cols-4">
          {testimonials.map((testimonial) => (
            <div key={testimonial.handle} className="group relative rounded-2xl border border-slate-800 bg-slate-900/50 p-6 shadow-lg backdrop-blur-sm transition-all hover:-translate-y-1 hover:border-emerald-500/30 hover:shadow-emerald-500/5">
              <div className="flex items-center gap-x-4 border-b border-slate-800/50 pb-4 mb-4">
                <img className="h-10 w-10 rounded-full bg-slate-800 object-cover" src={testimonial.avatar} alt="" />
                <div>
                  <h3 className="font-semibold text-white">{testimonial.name}</h3>
                  <p className="text-slate-500">{testimonial.handle}</p>
                </div>
              </div>
              <div className="flex gap-0.5 text-emerald-500 mb-3">
                <Star className="h-4 w-4 fill-current" />
                <Star className="h-4 w-4 fill-current" />
                <Star className="h-4 w-4 fill-current" />
                <Star className="h-4 w-4 fill-current" />
                <Star className="h-4 w-4 fill-current" />
              </div>
              <p className="text-slate-300 italic">"{testimonial.content}"</p>
            </div>
          ))}
        </div>

        {/* Scrolling logos */}
        <div className="mt-24 border-t border-slate-800/50 pt-16">
          <p className="text-center text-sm font-semibold text-slate-500 mb-8 uppercase tracking-widest">Trusted by teams at</p>
          <div className="flex justify-center gap-8 md:gap-16 opacity-40 grayscale mix-blend-screen flex-wrap">
            {['Acme Corp', 'GlobalBank', 'Nebula', 'Sisyphus', 'Catalog'].map((logo) => (
               <span key={logo} className="text-xl font-bold font-serif">{logo}</span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}