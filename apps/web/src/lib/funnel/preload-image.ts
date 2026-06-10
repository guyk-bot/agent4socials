/** Resolve only when the image URL loads successfully in the browser. */
export function preloadImageUrl(url: string, timeoutMs = 12_000): Promise<boolean> {
  if (typeof window === 'undefined' || !url.trim()) return Promise.resolve(false);
  return new Promise((resolve) => {
    const img = new Image();
    let settled = false;
    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      resolve(ok);
    };
    const timer = window.setTimeout(() => finish(false), timeoutMs);
    img.onload = () => finish(true);
    img.onerror = () => finish(false);
    img.src = url;
  });
}
