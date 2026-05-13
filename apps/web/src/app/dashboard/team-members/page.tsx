'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/** Legacy URL: team UI lives on Account under #team-members. */
export default function TeamMembersRedirectPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/dashboard/account#team-members');
  }, [router]);
  return (
    <div className="max-w-4xl py-8 text-sm text-neutral-600">
      Opening Account…
    </div>
  );
}
