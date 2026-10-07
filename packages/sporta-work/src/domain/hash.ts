/**
 * Pure deterministic id/hash helpers (no IO, no crypto imports — the
 * domain layer stays pure). Fixture-grade stability: same value in, same
 * id out.
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

/** FNV-1a 32-bit content fingerprint, 8 hex chars. */
export function fnv1aHex(input: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}
