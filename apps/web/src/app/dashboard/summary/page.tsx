import { redirect } from 'next/navigation';

/** Legacy URL: `/dashboard/summary` redirects to Console at `/dashboard/console`. */
export default async function DashboardSummaryRedirectPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const qs = new URLSearchParams();
  for (const [key, val] of Object.entries(sp)) {
    if (val === undefined) continue;
    if (Array.isArray(val)) {
      for (const v of val) qs.append(key, v);
    } else {
      qs.set(key, val);
    }
  }
  const q = qs.toString();
  redirect(`/dashboard/console${q ? `?${q}` : ''}`);
}
