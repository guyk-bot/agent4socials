import Link from 'next/link';

export default function SmartLinkNotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 px-4">
      <h1 className="text-2xl font-bold text-slate-800 mb-2">Link not found</h1>
      <p className="text-slate-600 mb-6 text-center max-w-sm">
        This link page doesn&apos;t exist or isn&apos;t published yet. If it&apos;s yours, save it from the Smart Links editor in your dashboard.
      </p>
      <Link
        href="/dashboard/smart-links"
        className="px-4 py-2 bg-[var(--primary)] text-neutral-900 rounded-lg font-medium hover:bg-[var(--primary-hover)] transition-colors"
      >
        Go to Smart Links
      </Link>
    </div>
  );
}
