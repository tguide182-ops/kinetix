export interface Debounced<A extends unknown[]> {
  (...args: A): void;
  cancel(): void;
  flush(): void;
}

export function debounce<A extends unknown[]>(fn: (...args: A) => void, wait: number, maxWait?: number): Debounced<A> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let firstCall: number | undefined;
  let lastArgs: A | undefined;
  const invoke = (): void => {
    timer = undefined;
    firstCall = undefined;
    const args = lastArgs;
    lastArgs = undefined;
    if (args) fn(...args);
  };
  const d = ((...args: A) => {
    lastArgs = args;
    const now = Date.now();
    firstCall ??= now;
    if (timer !== undefined) clearTimeout(timer);
    const remaining = maxWait !== undefined ? Math.max(0, Math.min(wait, firstCall + maxWait - now)) : wait;
    timer = setTimeout(invoke, remaining);
  }) as Debounced<A>;
  d.cancel = () => {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
    firstCall = undefined;
    lastArgs = undefined;
  };
  d.flush = () => {
    if (timer !== undefined) {
      clearTimeout(timer);
      invoke();
    }
  };
  return d;
}

export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason ?? new Error('aborted'));
    const t = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = (): void => {
      clearTimeout(t);
      reject(signal?.reason ?? new Error('aborted'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}
