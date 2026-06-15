/** Map axios/network errors to user-friendly iZop chat copy. */
export function friendlyIzopChatError(e: unknown, fallback: string): string {
  const axiosErr = e as {
    response?: { status?: number; data?: { message?: string } };
    code?: string;
    message?: string;
  };
  const serverMsg = axiosErr.response?.data?.message;
  if (serverMsg && typeof serverMsg === 'string') return serverMsg;

  const status = axiosErr.response?.status;
  if (status === 500) {
    return 'Server error while saving or publishing. Wait 30 seconds and try again, or use Open Composer.';
  }
  if (status === 503) {
    return 'Database is busy. Wait 30 seconds and try Allow again.';
  }

  const raw = String(axiosErr.message ?? '');
  if (
    axiosErr.code === 'ECONNABORTED' ||
    /timeout/i.test(raw) ||
    axiosErr.response?.status === 504
  ) {
    return 'That took too long (file uploads and AI replies can take up to a few minutes). Wait a moment and try again, or attach one file at a time.';
  }
  if (/failed to fetch|network error|load failed/i.test(raw)) {
    return 'Network error. Check your connection and try again.';
  }

  return raw || fallback;
}
