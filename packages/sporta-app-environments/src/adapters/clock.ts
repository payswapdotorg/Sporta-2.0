/**
 * W9C — clocks (adapters layer). Ambient time enters ONLY here; the
 * domain/app layers receive the injected clock (the sibling-packages law).
 */
import type { Iso8601 } from "@sporta/contracts/contract";
import type { AppEnvironmentClock } from "../domain/ports.js";

/** The REAL system clock (ISO-8601 UTC). */
export function systemClockNow(): Iso8601 {
  return new Date().toISOString();
}

/** A FIXED clock for deterministic tests (fixture-labeled usage). */
export class FixedClock implements AppEnvironmentClock {
  private current: Iso8601;
  constructor(initial: Iso8601) {
    this.current = initial;
  }
  now(): Iso8601 {
    return this.current;
  }
  /** Advance the fixture time (tests only). */
  advanceTo(next: Iso8601): void {
    this.current = next;
  }
}
