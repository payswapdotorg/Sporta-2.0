/**
 * W9C — stable serialization + fnv1a id helpers (domain — pure).
 *
 * Same idiom as the w9a/w9b `stable.ts`: deterministic record identities
 * need a canonical JSON form (sorted keys) and a fast non-crypto
 * id-scoping hash. No IO, no node: imports.
 */

/** Deterministic JSON: object keys sorted recursively, arrays kept in order. */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, item]) => item !== undefined)
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));
  return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`).join(",")}}`;
}

/** FNV-1a 32-bit hex — id scoping only (content digests use the hash port). */
export function fnv1aHex(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}
