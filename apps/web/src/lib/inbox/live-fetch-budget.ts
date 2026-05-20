/** Wall-clock cap for inbox live platform fetches (stay under Vercel 60s function limit). */
export const INBOX_LIVE_FETCH_BUDGET_MS = 45_000;

export const INBOX_LIVE_FETCH_BUDGET_ERROR = 'INBOX_LIVE_FETCH_BUDGET_EXCEEDED';

export function withInboxLiveFetchBudget<T>(fn: () => Promise<T>, budgetMs = INBOX_LIVE_FETCH_BUDGET_MS): Promise<T> {
  return Promise.race([
    fn(),
    new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error(INBOX_LIVE_FETCH_BUDGET_ERROR)), budgetMs);
    }),
  ]);
}

export function isInboxLiveFetchBudgetError(e: unknown): boolean {
  return e instanceof Error && e.message === INBOX_LIVE_FETCH_BUDGET_ERROR;
}
