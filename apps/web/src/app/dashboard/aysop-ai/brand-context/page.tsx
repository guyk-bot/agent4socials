import { redirect } from 'next/navigation';

/** Brand settings live on the main Brand page (left sidebar). */
export default function AysopBrandContextRedirectPage() {
  redirect('/dashboard/brand');
}
