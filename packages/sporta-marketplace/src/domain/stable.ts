/**
 * Recursively sort object keys; arrays keep their order.
 * (domain — pure, no IO.)
 */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(",")}}`;
}

/**
 * The canonical preimage for a candidate digest: stable-stringified over
 * every behavioral field of the frozen candidate record. Attestation and
 * content-hash array ORDER is part of identity (arrays keep order) —
 * reordering attestations is a behavioral change and must re-freeze.
 */
export function candidateDigestPreimage(candidate: {
  pipelineId: string;
  version: string;
  manifestDigest: string;
  contentHashes: readonly { kind: string; digest: string }[];
  attestations: readonly { kind: string; reference: string }[];
  submittedBy: string;
}): string {
  return stableStringify({
    pipelineId: candidate.pipelineId,
    version: candidate.version,
    manifestDigest: candidate.manifestDigest,
    contentHashes: candidate.contentHashes,
    attestations: candidate.attestations,
    submittedBy: candidate.submittedBy,
  });
}

/**
 * Deterministic id derivation preimage (defense in depth against id
 * collisions: content-derived ids are unique per distinct content, stable
 * per identical content). The injected hash port does the digesting.
 */
export function idPreimage(parts: readonly string[]): string {
  return stableStringify(parts);
}

/**
 * A short deterministic id from a digest (e.g.
 * `list:0123456789abcdef01234567`). Same digest -> same id; distinct
 * content -> distinct id. Pure string work.
 */
export function idFromDigest(prefix: string, digest: string): string {
  return `${prefix}:${digest.replace(/^sha256:/, "").slice(0, 24)}`;
}
