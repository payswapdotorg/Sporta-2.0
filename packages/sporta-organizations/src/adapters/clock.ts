/**
 * Real-time clock adapter (adapters layer only). Services receive the
 * pure `now: () => string` function; tests inject fixed clocks.
 */
export function systemClockNow(): string {
  return new Date().toISOString();
}
