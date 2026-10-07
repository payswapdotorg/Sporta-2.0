import type { Iso8601 } from "@sporta/contracts/contract";
import type { WorldClock } from "../domain/ports.js";
/**
 * Clock adapters (adapters layer).
 */

/** Deterministic fixed clock for tests and fixtures. */
export class FixedClock implements WorldClock {
  private current: Iso8601;

  constructor(start: Iso8601 = "2026-01-01T00:00:00.000Z") {
    this.current = start;
  }

  now(): Iso8601 {
    return this.current;
  }

  advance(milliseconds: number): void {
    this.current = new Date(Date.parse(this.current) + milliseconds).toISOString();
  }
}

/** Real wall clock. */
export class SystemClock implements WorldClock {
  now(): Iso8601 {
    return new Date().toISOString();
  }
}
