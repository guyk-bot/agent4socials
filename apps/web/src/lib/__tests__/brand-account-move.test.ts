import {
  DEFAULT_BRAND_ID,
  applyBrandMapUpdatesOnAccountsSync,
  countAccountsForBrand,
  repairCorruptedBrandMap,
  resolvePostConnectBrandAction,
  shouldPromptMoveFromOtherBrand,
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

describe('resolvePostConnectBrandAction', () => {
  const brandMain = DEFAULT_BRAND_ID;
  const brandGuy = 'brand-guy';

  it('assigns to active brand on first connect when the account has no explicit map entry', () => {
    const action = resolvePostConnectBrandAction({}, 'ig-guy', brandGuy, [
      { id: 'ig-main', platform: 'INSTAGRAM' },
      { id: 'ig-guy', platform: 'INSTAGRAM' },
    ]);
    expect(action).toEqual({ type: 'assign_active' });
  });

  it('assigns TikTok on first connect without prompting', () => {
    expect(
      resolvePostConnectBrandAction({}, 'tt', brandGuy, [{ id: 'tt', platform: 'TIKTOK' }])
    ).toEqual({ type: 'assign_active' });
  });

  it('prompts when TikTok is explicitly mapped to the other brand', () => {
    const map = { tt: brandMain };
    expect(
      resolvePostConnectBrandAction(map, 'tt', brandGuy, [{ id: 'tt', platform: 'TIKTOK' }])
    ).toEqual({ type: 'prompt_move', fromBrandId: brandMain });
  });

  it('prompts when TikTok is reconnecting from the default brand', () => {
    expect(
      resolvePostConnectBrandAction({}, 'tt', brandGuy, [{ id: 'tt', platform: 'TIKTOK' }], {
        isReconnect: true,
      })
    ).toEqual({ type: 'prompt_move', fromBrandId: brandMain });
  });

  it('does not prompt when another Instagram is the visible one on the other brand', () => {
    const map = {
      'ig-main': brandMain,
      'ig-guy': brandMain,
    };
    expect(
      shouldPromptMoveFromOtherBrand(
        [
          { id: 'ig-main', platform: 'INSTAGRAM' },
          { id: 'ig-guy', platform: 'INSTAGRAM' },
        ],
        map,
        'ig-guy',
        brandGuy
      )
    ).toBe(false);
    expect(resolvePostConnectBrandAction(map, 'ig-guy', brandGuy, [
      { id: 'ig-main', platform: 'INSTAGRAM' },
      { id: 'ig-guy', platform: 'INSTAGRAM' },
    ])).toEqual({ type: 'assign_active' });
  });

  it('prompts when this account is the visible Instagram on the other brand', () => {
    const map = { 'ig-guy': brandMain };
    expect(
      shouldPromptMoveFromOtherBrand([{ id: 'ig-guy', platform: 'INSTAGRAM' }], map, 'ig-guy', brandGuy)
    ).toBe(true);
    expect(resolvePostConnectBrandAction(map, 'ig-guy', brandGuy, [
      { id: 'ig-guy', platform: 'INSTAGRAM' },
    ])).toEqual({ type: 'prompt_move', fromBrandId: brandMain });
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
