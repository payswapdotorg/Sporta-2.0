/**
 * Pure deterministic serialization helpers (no IO). Module-local copy —
 * organizations cannot import utilities from sibling Sporta modules that
 * are not declared dependencies; each module stays self-contained.
 */

/** Canonical stable serialization: object keys sorted recursively. */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, entryValue]) => entryValue !== undefined)
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));
  return `{${entries.map(([key, entryValue]) => `${JSON.stringify(key)}:${stableStringify(entryValue)}`).join(",")}}`;
}

/** Structural deep equality for JSON-safe values (order-insensitive on keys). */
export function stableEquals(left: unknown, right: unknown): boolean {
  return stableStringify(left) === stableStringify(right);
}
