import { describe, expect, it, beforeEach } from 'vitest';
import {
  getInboxNotifyBaseline,
  setInboxNotifyBaseline,
  shouldNotifyInboxComment,
} from '../inbox-notify-baseline';

const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => {
      store[k] = v;
    },
    removeItem: (k: string) => {
      delete store[k];
    },
    clear: () => {
      store = {};
    },
  };
})();

describe('inbox-notify-baseline', () => {
  beforeEach(() => {
    localStorageMock.clear();
    Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock, configurable: true });
  });

  it('only notifies comments created after the baseline', () => {
    const now = Date.now();
    setInboxNotifyBaseline('acc-1', 'user-1', now);
    expect(
      shouldNotifyInboxComment(
        { accountId: 'acc-1', createdAt: new Date(now - 60_000).toISOString() },
        'user-1'
      )
    ).toBe(false);
    expect(
      shouldNotifyInboxComment(
        { accountId: 'acc-1', createdAt: new Date(now + 5_000).toISOString() },
        'user-1'
      )
    ).toBe(true);
  });

  it('returns false when baseline is missing', () => {
    expect(
      shouldNotifyInboxComment(
        { accountId: 'acc-1', createdAt: new Date().toISOString() },
        'user-1'
      )
    ).toBe(false);
    expect(getInboxNotifyBaseline('acc-1', 'user-1')).toBeNull();
  });
});
