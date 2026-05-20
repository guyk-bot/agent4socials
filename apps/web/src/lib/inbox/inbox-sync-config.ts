/**
 * Inbox data is refreshed on this interval by AppDataContext (not when the user opens Inbox).
 * UI reads cached conversations/comments only.
 */
export const INBOX_SYSTEM_SYNC_MS = 120_000;
