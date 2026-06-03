import {
  DEFAULT_BRAND_ID,
  applyBrandMapUpdatesOnAccountsSync,
  countAccountsForBrand,
  repairCorruptedBrandMap,
} from '../brand-account-move';

const accounts = [
  { id: 'ig', platform: 'INSTAGRAM' },
  { id: 'fb', platform: 'FACEBOOK' },
  { id: 'tt', platform: 'TIKTOK' },
];

describe('applyBrandMapUpdatesOnAccountsSync', () => {
  it('assigns only genuinely new account ids to the active brand', () => {
    const map = applyBrandMapUpdatesOnAccountsSync({
      prevMap: {},
      prevAccountIds: new Set<string>(),
      nextAccounts: accounts,
      activeBrandId: 'brand-other',
      deferBrandAssign: false,
    });
    expect(map).toEqual({});
  });

  it('assigns a new id when it appears in the account list', () => {
    const map = applyBrandMapUpdatesOnAccountsSync({
      prevMap: { fb: DEFAULT_BRAND_ID },
      prevAccountIds: new Set(['fb']),
      nextAccounts: accounts,
      activeBrandId: 'brand-other',
      deferBrandAssign: false,
    });
    expect(map.ig).toBe('brand-other');
    expect(map.tt).toBe('brand-other');
    expect(map.fb).toBe(DEFAULT_BRAND_ID);
  });
});

describe('repairCorruptedBrandMap', () => {
  it('clears a secondary brand that owns almost every platform', () => {
    const brandOther = 'brand-guy';
    const corrupted: Record<string, string> = {};
    for (const a of accounts) corrupted[a.id] = brandOther;
    const repaired = repairCorruptedBrandMap(corrupted, accounts, [DEFAULT_BRAND_ID, brandOther]);
    expect(repaired).toEqual({});
  });
});

describe('countAccountsForBrand', () => {
  it('counts at most one row per platform', () => {
    const map = { ig: DEFAULT_BRAND_ID, ig2: DEFAULT_BRAND_ID };
    const n = countAccountsForBrand(
      [
        { id: 'ig', platform: 'INSTAGRAM' },
        { id: 'ig2', platform: 'INSTAGRAM' },
        { id: 'fb', platform: 'FACEBOOK' },
      ],
      map,
      DEFAULT_BRAND_ID
    );
    expect(n).toBe(2);
  });
});
