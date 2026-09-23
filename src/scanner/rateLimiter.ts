/** Enforces a minimum delay between successive outbound requests. */
export class RateLimiter {
  private lastCallAt = 0;
  private queue: Promise<void> = Promise.resolve();

  constructor(private readonly delaySeconds: number) {}

  async wait(): Promise<void> {
    const runNext = this.queue.then(async () => {
      const elapsed = (Date.now() - this.lastCallAt) / 1000;
      if (elapsed < this.delaySeconds) {
        await new Promise((resolve) => setTimeout(resolve, (this.delaySeconds - elapsed) * 1000));
      }
      this.lastCallAt = Date.now();
    });
    this.queue = runNext;
    return runNext;
  }
}
