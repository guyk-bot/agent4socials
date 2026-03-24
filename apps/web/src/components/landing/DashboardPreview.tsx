import { BarChart3, Calendar, Users, ArrowUpRight, MoreHorizontal, CheckCircle2 } from 'lucide-react';

export default function DashboardPreview() {
  return (
    <div className="relative mx-auto mt-16 max-w-5xl px-4 sm:mt-24 overflow-hidden">
      <div className="relative rounded-2xl border border-[#eadff5] bg-white p-2 shadow-xl lg:rounded-3xl lg:p-3">
        {/* Browser chrome */}
        <div className="absolute top-0 left-0 right-0 h-12 rounded-t-2xl bg-[#fcf8ff] border-b border-[#efe7f7] flex items-center px-4 gap-2">
          <div className="flex gap-2">
            <div className="h-3 w-3 rounded-full bg-[#d7263d]/15 border border-[#d7263d]/50" />
            <div className="h-3 w-3 rounded-full bg-[#ff3d00]/15 border border-[#ff3d00]/50" />
            <div className="h-3 w-3 rounded-full bg-[#2f9e44]/15 border border-[#2f9e44]/50" />
          </div>
          <div className="mx-auto w-1/2 h-6 rounded-md bg-white border border-[#efe7f7] text-[10px] text-[#8f7ca9] flex items-center justify-center font-mono">
            agent4socials.com/dashboard
          </div>
        </div>

        {/* Dashboard Content */}
        <div className="mt-12 rounded-xl bg-white border border-[#efe7f7] overflow-hidden shadow-lg">
          <div className="flex h-[500px] md:h-[600px]">
            {/* Sidebar */}
            <div className="hidden w-16 md:w-64 flex-col border-r border-[#f3ecf9] bg-[#fcfaff] p-4 md:flex">
              <div className="space-y-6">
                <div className="h-8 w-8 rounded-lg bg-[#7b2cbf]/10 border border-[#7b2cbf]/30" />
                <div className="space-y-2">
                  <div className="h-2 w-20 rounded bg-[#e9def5]" />
                  <div className="h-2 w-12 rounded bg-[#e9def5]" />
                </div>
              </div>
              <div className="mt-8 space-y-1">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className={`h-10 w-full rounded-lg ${i === 1 ? 'bg-[#f7f1fc] border border-[#e3d0f0]' : 'bg-transparent'} flex items-center px-3`}>
                     <div className={`h-4 w-4 rounded ${i === 1 ? 'bg-[#7b2cbf]/50' : 'bg-[#e9def5]'}`} />
                     <div className={`ml-3 h-2 w-24 rounded ${i === 1 ? 'bg-[#7b2cbf]/35' : 'bg-[#e9def5]'}`} />
                  </div>
                ))}
              </div>
            </div>

            {/* Main Content */}
            <div className="flex-1 overflow-hidden bg-white p-4 md:p-8">
              <div className="flex items-center justify-between mb-8">
                <div>
                  <h3 className="text-xl font-bold text-[#1a161f]">Overview</h3>
                  <p className="text-sm text-[#8f7ca9]">Welcome back, Creator</p>
                </div>
                <div className="h-9 w-32 rounded-lg bg-[linear-gradient(135deg,#7b2cbf,#d7263d)] flex items-center justify-center text-xs font-bold text-white shadow-lg shadow-[#7b2cbf]/20">
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
                  <div key={i} className="rounded-xl border border-[#efe7f7] bg-white p-4">
                    <div className="flex items-center justify-between">
                      <stat.icon className="h-5 w-5 text-[#7b2cbf]" />
                      <span className="text-xs font-medium text-[#2f9e44] flex items-center gap-1">
                        {stat.change} <ArrowUpRight className="h-3 w-3" />
                      </span>
                    </div>
                    <div className="mt-4">
                      <div className="text-2xl font-bold text-[#1a161f]">{stat.val}</div>
                      <div className="text-xs text-[#8f7ca9]">{stat.label}</div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Chart Area */}
              <div className="rounded-xl border border-[#efe7f7] bg-white p-6 mb-8">
                <div className="flex items-center justify-between mb-6">
                  <div className="h-4 w-32 rounded bg-[#eadff5]" />
                  <div className="h-8 w-24 rounded-lg bg-[#fbf7ff] border border-[#efe7f7]" />
                </div>
                <div className="flex items-end gap-2 h-48">
                  {[40, 65, 45, 80, 55, 70, 45, 90, 60, 75, 50, 65].map((h, i) => (
                    <div key={i} className="flex-1 bg-gradient-to-t from-[#f8efff] to-[#f1dbe8] rounded-t-sm relative group">
                      <div 
                        className="absolute bottom-0 w-full bg-[linear-gradient(180deg,#7b2cbf,#d7263d)] rounded-t-sm transition-all duration-500 group-hover:opacity-90"
                        style={{ height: `${h}%` }} 
                      />
                    </div>
                  ))}
                </div>
              </div>

              {/* Recent Posts */}
              <div className="space-y-3">
                <div className="text-sm font-medium text-[#8f7ca9] mb-4">Recent Activity</div>
                {[1, 2].map((i) => (
                  <div key={i} className="flex items-center justify-between p-3 rounded-lg border border-[#f1e8f8] bg-[#fffefe] hover:bg-[#fdf8ff] transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-lg bg-[#f5edf9] flex items-center justify-center">
                        <div className="h-5 w-5 rounded bg-[#d7c5e9]" />
                      </div>
                      <div>
                        <div className="h-3 w-32 rounded bg-[#e3d3f0] mb-1.5" />
                        <div className="h-2 w-20 rounded bg-[#f0e6f8]" />
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="hidden sm:flex items-center gap-1 text-xs text-[#7e6c97]">
                        <CheckCircle2 className="h-3 w-3 text-[#2f9e44]" />
                        Published
                      </div>
                      <MoreHorizontal className="h-4 w-4 text-[#9a8aae]" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
        
        {/* Subtle glow - no blur to avoid GPU rendering issues in some browsers */}
        <div className="absolute -inset-4 bg-gradient-to-r from-[#7b2cbf]/20 via-[#d7263d]/15 to-[#3f37c9]/10 opacity-50 -z-10 rounded-[3rem] pointer-events-none" />
      </div>
    </div>
  );
}