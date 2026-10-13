/**
 * Injectable clocks (adapters layer — the sporta-work/adapters/clock
 * precedent). Record timestamps come only from injected clocks; the
 * domain and app layers never read ambient time.
 */

/** Real system clock (ISO-8601, millisecond precision). */
export function systemClockNow(): string {
  return new Date().toISOString();
}

/** Fixed clock for deterministic tests (fixture-grade, labeled). */
export class FixedClock {
  private current: string;

  constructor(start: string) {
    this.current = start;
  }

  now(): string {
    return this.current;
  }

  /** Advance deterministically (tests only; fixture evidence). */
  advanceTo(next: string): void {
    this.current = next;
  }
}
