import { redirect } from 'next/navigation';

/** Legacy route under old iZop AI path. */
export default function LegacyAysopBrandContextRedirectPage() {
  redirect('/dashboard/brand');
}
