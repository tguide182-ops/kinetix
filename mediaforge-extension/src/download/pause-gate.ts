/** Cooperative pause: workers await `wait()` between units of work. */
export class PauseGate {
  private paused = false;
  private waiters: Array<() => void> = [];

  get isPaused(): boolean {
    return this.paused;
  }

  pause(): void {
    this.paused = true;
  }

  resume(): void {
    this.paused = false;
    const w = this.waiters;
    this.waiters = [];
    w.forEach((fn) => fn());
  }

  wait(signal?: AbortSignal): Promise<void> {
    if (!this.paused) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const onAbort = (): void => reject(signal?.reason ?? new Error('aborted'));
      if (signal?.aborted) return onAbort();
      signal?.addEventListener('abort', onAbort, { once: true });
      this.waiters.push(() => {
        signal?.removeEventListener('abort', onAbort);
        resolve();
      });
    });
  }
}
