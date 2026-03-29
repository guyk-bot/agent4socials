'use client';

import { AnalyticsQueryProvider } from '@/components/analytics/AnalyticsQueryProvider';
import { TrafficAudienceSection } from '@/components/analytics/TrafficAudienceSection';

export default function TrafficAudiencePage() {
  return (
    <AnalyticsQueryProvider>
      <div className="min-h-full bg-[#F8FAFC] -m-6 p-6 md:-m-8 md:p-8">
        <TrafficAudienceSection />
      </div>
    </AnalyticsQueryProvider>
  );
}
