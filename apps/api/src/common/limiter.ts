/** At most `limit` uses per key in any sliding window; kept in memory, so it resets on restart. */
export class WindowLimiter {
  private readonly uses = new Map<string, number[]>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly now = () => Date.now(),
  ) {}

  take(key: string): boolean {
    const now = this.now();
    const recent = (this.uses.get(key) ?? []).filter(
      (t) => now - t < this.windowMs,
    );
    if (recent.length >= this.limit) {
      this.uses.set(key, recent);
      return false;
    }
    recent.push(now);
    this.uses.set(key, recent);
    if (this.uses.size > 10_000) this.forgetIdle(now);
    return true;
  }

  /** Drops keys with no use in the last window, so the map does not grow without bound. */
  private forgetIdle(now: number) {
    for (const [key, times] of this.uses) {
      if (times.every((t) => now - t >= this.windowMs)) this.uses.delete(key);
    }
  }
}
