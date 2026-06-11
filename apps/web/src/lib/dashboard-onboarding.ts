/** Default landing when the user has not connected any social platform yet. */
export const CONNECTED_ACCOUNTS_PATH = '/dashboard/account#connected-accounts';

const ANALYTICS_LANDING_PATHS = new Set(['/dashboard', '/dashboard/console', '/dashboard/summary']);

/** True when URL params indicate an in-progress or post-OAuth connect flow (do not redirect away). */
export function isActiveConnectFlow(search: string): boolean {
  const p = new URLSearchParams(search);
  if (p.get('connect')) return true;
  if (p.get('connecting') === '1') return true;
  if (p.get('connect_error')) return true;
  if (p.get('twitter_1oa_next')) return true;
  if (p.get('just_connected') === '1') return true;
  return false;
}

export function shouldRedirectEmptyAccountsToConnect(
  pathname: string,
  search: string
): boolean {
  if (pathname === '/dashboard/account') return false;
  if (isActiveConnectFlow(search)) return false;
  return ANALYTICS_LANDING_PATHS.has(pathname);
}

export function consoleHrefForAccountState(hasConnectedAccounts: boolean): string {
  return hasConnectedAccounts ? '/dashboard/console' : CONNECTED_ACCOUNTS_PATH;
}
