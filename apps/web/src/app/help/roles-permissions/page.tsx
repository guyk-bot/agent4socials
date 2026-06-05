'use client';

import React from 'react';
import Link from 'next/link';
import { ShieldCheck, ArrowLeft } from 'lucide-react';

export default function RolesPermissionsPage() {
  return (
    <div className="mx-auto max-w-4xl pb-16">
      <div className="mb-6">
        <Link href="/help" className="inline-flex items-center gap-2 text-sm font-medium text-neutral-600 hover:text-neutral-900">
          <ArrowLeft size={16} />
          Back to help
        </Link>
      </div>

      <div className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-orange-100 p-2.5 text-orange-700">
            <ShieldCheck size={20} />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-neutral-900">Roles and Permissions</h1>
        </div>
        <p className="mt-3 text-sm text-neutral-600">
          This guide explains exactly what each workspace role can do in izop.
        </p>

        <div className="mt-6 space-y-4">
          <section className="rounded-xl border border-neutral-200 bg-neutral-50 p-4">
            <h2 className="text-base font-semibold text-neutral-900">Admin</h2>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-neutral-700">
              <li>Manage team members, including adding and removing members, on Account under Team members (below your brands).</li>
              <li>Edit brand name and brand image from Account using the brand menu.</li>
              <li>Manage connected accounts and review analytics.</li>
              <li>Create, edit, and publish content across supported platforms.</li>
              <li>Use account and brand level settings available in the dashboard.</li>
            </ul>
          </section>

          <section className="rounded-xl border border-neutral-200 bg-neutral-50 p-4">
            <h2 className="text-base font-semibold text-neutral-900">Editor</h2>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-neutral-700">
              <li>Create and edit posts, drafts, and scheduled content.</li>
              <li>View analytics and team content status.</li>
              <li>Collaborate with team members on content tasks.</li>
              <li>Cannot manage team access or brand level settings.</li>
            </ul>
          </section>

          <section className="rounded-xl border border-neutral-200 bg-neutral-50 p-4">
            <h2 className="text-base font-semibold text-neutral-900">Viewer</h2>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-neutral-700">
              <li>Read-only visibility for analytics and connected content.</li>
              <li>Can review performance and history data.</li>
              <li>Cannot create, edit, schedule, publish, or delete posts.</li>
              <li>Cannot update brand settings or team members.</li>
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}
