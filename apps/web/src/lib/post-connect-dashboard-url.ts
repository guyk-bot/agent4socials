/** Dashboard URL after OAuth / page-picker connect (sidebar + analytics selection). */
export function buildPostConnectDashboardPath(
  accountId: string,
  platform: string,
  username?: string | null,
  profilePicture?: string | null
): string {
  const params = new URLSearchParams({
    accountId,
    connecting: '1',
    newPlatform: platform,
  });
  if (username) params.set('newUsername', username);
  if (profilePicture && profilePicture.length < 600) {
    params.set('newPic', profilePicture);
  }
  return `/dashboard?${params.toString()}`;
}
