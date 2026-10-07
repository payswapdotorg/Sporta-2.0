/**
 * Typed edit operations (domain layer — pure).
 *
 * The frozen `EditDeltaRecord.operations` is a `readonly string[]`; this
 * module gives those strings a typed parse view: every canonical string is
 * `<kind> <path>[ <valueHash>]`, produced by `serializeEditOperation` and
 * read back losslessly with `parseEditOperation`.
 */

/** One typed edit operation (additive Wave 1 type). */
export interface EditOperation {
  kind: "set" | "insert" | "delete" | "move";
  /** Slash-separated path inside the external project state. */
  path: string;
  /** sha-256 of the operation's value, when it carries one. */
  valueHash?: string;
}

/** Canonical, lossless serialization of one edit operation. */
export function serializeEditOperation(operation: EditOperation): string {
  const base = `${operation.kind} ${operation.path}`;
  return operation.valueHash === undefined ? base : `${base} ${operation.valueHash}`;
}

/**
 * Parse a canonical operation string. Returns null for anything that is
 * not a well-formed operation (never a guess).
 */
export function parseEditOperation(serialized: string): EditOperation | null {
  const parts = serialized.split(" ");
  const kind = parts[0];
  if (kind !== "set" && kind !== "insert" && kind !== "delete" && kind !== "move") {
    return null;
  }
  const path = parts[1];
  if (path === undefined || path.length === 0) return null;
  if (parts.length > 3) return null;
  const valueHash = parts[2];
  if (valueHash === undefined) return { kind, path };
  return { kind, path, valueHash };
}
