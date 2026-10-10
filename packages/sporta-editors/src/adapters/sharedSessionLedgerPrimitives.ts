import type { PolicySet } from "@sporta/contracts/contract";
/**
 * Shared parse primitives for the shared-session ledger (adapters layer
 * — pure). Extracted so the ledger and close-result parsers share one
 * implementation WITHOUT importing each other (the architecture check's
 * no-cycle law).
 */

/** The fail-closed refusal every ledger parser throws through. */
export type LedgerFail = (reason: string) => never;

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isStringArray(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}

/**
 * Parse a PolicySet block: it must be an object whose rights carry
 * string usages/prohibitions arrays. The block is then carried verbatim
 * (its rights arrays were just checked).
 */
export function parsePolicySet(
  value: unknown,
  fail: (reason: string) => never,
  label: string,
): PolicySet {
  if (!isPlainObject(value)) return fail(`missing-${label}`);
  if (!isPlainObject(value.rights)) return fail(`bad-${label}-rights`);
  if (!isStringArray(value.rights.usages)) return fail(`bad-${label}-rights-usages`);
  if (!isStringArray(value.rights.prohibitions)) {
    return fail(`bad-${label}-rights-prohibitions`);
  }
  return value as unknown as PolicySet;
}
