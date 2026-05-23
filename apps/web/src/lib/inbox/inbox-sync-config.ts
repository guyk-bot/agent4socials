/**
 * Inbox data is refreshed on this interval by AppDataContext (not when the user opens Inbox).
 * UI reads cached conversations/comments only.
 * 5 min keeps nav badges fresh without stacking Meta Graph calls every 2 min.
 */
export const INBOX_SYSTEM_SYNC_MS = 300_000;
