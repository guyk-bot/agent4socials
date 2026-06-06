import {
  accountMappedBrandId,
  countAccountsForBrand,
  toBrandMapAccountRef,
} from '@/lib/brand-account-move';

export type AysopWorkspaceSnapshot = {
  id: string;
  name: string;
  connectedAccountCount: number;
  accounts: Array<{ id: string; platform: string; username: string | null }>;
};

/** Build brand workspace snapshot from client-side brand map (matches Account page). */
export function buildAysopWorkspaceSnapshot(
  brands: Array<{ id: string; name: string }>,
  accounts: Array<{ id: string; platform: string; username?: string | null }>,
  brandMap: Record<string, string>
): AysopWorkspaceSnapshot[] {
  const refs = accounts.map(toBrandMapAccountRef);
  return brands.map((brand) => {
    const brandAccounts = accounts.filter(
      (a) => accountMappedBrandId(brandMap, a.id) === brand.id
    );
    return {
      id: brand.id,
      name: brand.name,
      connectedAccountCount: countAccountsForBrand(refs, brandMap, brand.id),
      accounts: brandAccounts.map((a) => ({
        id: a.id,
        platform: a.platform,
        username: a.username ?? null,
      })),
    };
  });
}
