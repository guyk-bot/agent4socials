import { BarChart3, Calendar, Users, ArrowUpRight, MoreHorizontal, CheckCircle2 } from 'lucide-react';

export default function DashboardPreview() {
  return (
    <div className="relative mx-auto mt-16 max-w-5xl px-4 sm:mt-24 overflow-hidden">
      <div className="relative rounded-2xl border border-slate-800 bg-slate-900/50 p-2 shadow-2xl lg:rounded-3xl lg:p-3">
        {/* Browser chrome */}
        <div className="absolute top-0 left-0 right-0 h-12 rounded-t-2xl bg-slate-900/90 border-b border-slate-800 flex items-center px-4 gap-2">
          <div className="flex gap-2">
            <div className="h-3 w-3 rounded-full bg-red-500/20 border border-red-500/50" />
            <div className="h-3 w-3 rounded-full bg-amber-500/20 border border-amber-500/50" />
            <div className="h-3 w-3 rounded-full bg-emerald-500/20 border border-emerald-500/50" />
          </div>
          <div className="mx-auto w-1/2 h-6 rounded-md bg-slate-800/50 border border-slate-700/50 text-[10px] text-slate-500 flex items-center justify-center font-mono">
            agent4socials.com/dashboard
          </div>
        </div>

        {/* Dashboard Content */}
        <div className="mt-12 rounded-xl bg-slate-950 border border-slate-800 overflow-hidden shadow-2xl">
          <div className="flex h-[500px] md:h-[600px]">
            {/* Sidebar */}
            <div className="hidden w-16 md:w-64 flex-col border-r border-slate-800 bg-slate-900/30 p-4 md:flex">
              <div className="space-y-6">
                <div className="h-8 w-8 rounded-lg bg-emerald-500/20 border border-emerald-500/30" />
                <div className="space-y-2">
                  <div className="h-2 w-20 rounded bg-slate-800" />
                  <div className="h-2 w-12 rounded bg-slate-800" />
                </div>
              </div>
              <div className="mt-8 space-y-1">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className={`h-10 w-full rounded-lg ${i === 1 ? 'bg-emerald-500/10 border border-emerald-500/20' : 'bg-transparent'} flex items-center px-3`}>
                     <div className={`h-4 w-4 rounded ${i === 1 ? 'bg-emerald-500/40' : 'bg-slate-800'}`} />
                     <div className={`ml-3 h-2 w-24 rounded ${i === 1 ? 'bg-emerald-500/30' : 'bg-slate-800'}`} />
                  </div>
                ))}
              </div>
            </div>

            {/* Main Content */}
            <div className="flex-1 overflow-hidden bg-slate-950 p-4 md:p-8">
              <div className="flex items-center justify-between mb-8">
                <div>
                  <h3 className="text-xl font-bold text-slate-200">Overview</h3>
                  <p className="text-sm text-slate-500">Welcome back, Creator</p>
                </div>
                <div className="h-9 w-32 rounded-lg bg-emerald-500 flex items-center justify-center text-xs font-bold text-white shadow-lg shadow-emerald-500/20">
                  + New Post
                </div>
              </div>

              {/* Stats Grid */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
                {[
                  { label: 'Total Views', val: '2.4M', change: '+12%', icon: Users },
                  { label: 'Engagement', val: '8.1%', change: '+5.3%', icon: BarChart3 },
                  { label: 'Scheduled', val: '14', change: 'Next: 2h', icon: Calendar },
                ].map((stat, i) => (
                  <div key={i} className="rounded-xl border border-slate-800 bg-slate-900/20 p-4">
                    <div className="flex items-center justify-between">
                      <stat.icon className="h-5 w-5 text-slate-500" />
                      <span className="text-xs font-medium text-emerald-400 flex items-center gap-1">
                        {stat.change} <ArrowUpRight className="h-3 w-3" />
                      </span>
                    </div>
                    <div className="mt-4">
                      <div className="text-2xl font-bold text-slate-200">{stat.val}</div>
                      <div className="text-xs text-slate-500">{stat.label}</div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Chart Area */}
              <div className="rounded-xl border border-slate-800 bg-slate-900/20 p-6 mb-8">
                <div className="flex items-center justify-between mb-6">
                  <div className="h-4 w-32 rounded bg-slate-800" />
                  <div className="h-8 w-24 rounded-lg bg-slate-800/50 border border-slate-700/50" />
                </div>
                <div className="flex items-end gap-2 h-48">
                  {[40, 65, 45, 80, 55, 70, 45, 90, 60, 75, 50, 65].map((h, i) => (
                    <div key={i} className="flex-1 bg-gradient-to-t from-emerald-500/5 to-emerald-500/20 rounded-t-sm relative group">
                      <div 
                        className="absolute bottom-0 w-full bg-emerald-500 rounded-t-sm transition-all duration-500 group-hover:bg-emerald-400"
                        style={{ height: `${h}%` }} 
                      />
                    </div>
                  ))}
                </div>
              </div>

              {/* Recent Posts */}
              <div className="space-y-3">
                <div className="text-sm font-medium text-slate-400 mb-4">Recent Activity</div>
                {[1, 2].map((i) => (
                  <div key={i} className="flex items-center justify-between p-3 rounded-lg border border-slate-800/50 bg-slate-900/10 hover:bg-slate-900/30 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-lg bg-slate-800 flex items-center justify-center">
                        <div className="h-5 w-5 rounded bg-slate-700" />
                      </div>
                      <div>
                        <div className="h-3 w-32 rounded bg-slate-800 mb-1.5" />
                        <div className="h-2 w-20 rounded bg-slate-800/50" />
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="hidden sm:flex items-center gap-1 text-xs text-slate-500">
                        <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                        Published
                      </div>
                      <MoreHorizontal className="h-4 w-4 text-slate-600" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
        
        {/* Subtle glow - no blur to avoid GPU rendering issues in some browsers */}
        <div className="absolute -inset-4 bg-gradient-to-r from-emerald-500/30 to-sky-500/30 opacity-10 -z-10 rounded-[3rem] pointer-events-none" />
      </div>
    </div>
  );
}