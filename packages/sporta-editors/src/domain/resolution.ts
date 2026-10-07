import { EditorResolutionError } from "./errors.js";
import type { EditorAvailability, EditorResolution, ResolveEditorInput } from "./ports.js";
/**
 * Deterministic, explainable editor resolution (domain layer — pure).
 *
 * Licensing classification is fail-closed: an unrecognized license NEVER
 * permits usage. Token mechanics: the license string is lowercased and
 * split on non-alphanumeric separators; a license permits usage only when
 * it contains a recognized permitting token and no denying token.
 */

/** Deny every usage (reserved-rights or proprietary markers). */
const ALWAYS_DENIED_TOKENS = new Set(["proprietary", "reserved", "arr"]);

/** Deny derivative usage only (edit / round-trip). */
const DERIVATIVES_DENIED_TOKENS = new Set(["nd", "derivatives"]);

/** Recognized permissive/copyleft token families. */
const PERMITTING_TOKENS = new Set([
  "gpl",
  "agpl",
  "lgpl",
  "mpl",
  "mit",
  "apache",
  "bsd",
  "isc",
  "unlicense",
  "public",
  "domain",
  "cc",
  "by",
  "ofl",
  "epl",
]);

/** The integration level an operation requires (1 export, 2 round-trip). */
export function requiredIntegrationLevel(operation: ResolveEditorInput["operation"]): 1 | 2 | 3 {
  return operation === "export" || operation === "inspect" ? 1 : 2;
}

function licenseTokens(licensing: string): string[] {
  return licensing
    .trim()
    .toLowerCase()
    .split(/[^a-z0-9.]+/)
    .filter((token) => token.length > 0);
}

/** Fail-closed license classification; unknown licenses never permit. */
export function licensePermitsUsage(
  licensing: string,
  operation: ResolveEditorInput["operation"],
): boolean {
  const tokens = licenseTokens(licensing);
  if (tokens.length === 0) return false;
  if (tokens.some((token) => ALWAYS_DENIED_TOKENS.has(token))) return false;
  if (
    (operation === "edit" || operation === "round-trip") &&
    tokens.some((token) => DERIVATIVES_DENIED_TOKENS.has(token))
  ) {
    return false;
  }
  return tokens.some((token) => PERMITTING_TOKENS.has(token));
}

function describeAvailability(availability: readonly EditorAvailability[]): string {
  if (availability.length === 0) return "none";
  return availability
    .map(
      (candidate) =>
        `${candidate.editorId}(level ${candidate.integrationLevel}, license ${candidate.licensing})`,
    )
    .join("; ");
}

/**
 * Resolve the editor deterministically:
 * 1. filter to editors meeting the required integration level whose
 *    license permits the requested usage;
 * 2. honor an eligible user preference when present;
 * 3. otherwise the highest integration level wins, ties broken by
 *    ascending editorId (stable);
 * 4. no eligible editor -> typed EditorResolutionError.
 */
export function resolveEditorChoice(input: ResolveEditorInput): EditorResolution {
  const requiredLevel = requiredIntegrationLevel(input.operation);
  const eligible = input.availability.filter(
    (candidate) =>
      candidate.integrationLevel >= requiredLevel &&
      licensePermitsUsage(candidate.licensing, input.operation),
  );
  if (eligible.length === 0) {
    throw new EditorResolutionError(
      `no eligible editor for operation "${input.operation}" (required integration level ${requiredLevel})`,
      `availability=${describeAvailability(input.availability)}`,
    );
  }

  const preferred =
    input.userPreference !== undefined
      ? eligible.find((candidate) => candidate.editorId === input.userPreference)
      : undefined;
  if (preferred !== undefined) {
    return {
      editorId: preferred.editorId,
      integrationLevel: preferred.integrationLevel,
      rationale:
        `user preference "${preferred.editorId}" honored: it is eligible for "${input.operation}" ` +
        `(integration level ${preferred.integrationLevel} >= required ${requiredLevel}) and its license ` +
        `(${preferred.licensing}) permits the usage`,
    };
  }

  const sorted = [...eligible].sort(
    (left, right) =>
      right.integrationLevel - left.integrationLevel ||
      (left.editorId < right.editorId ? -1 : left.editorId > right.editorId ? 1 : 0),
  );
  const best = sorted[0];
  if (best === undefined) {
    throw new EditorResolutionError("eligible set became empty", "internal");
  }
  const preferenceNote =
    input.userPreference !== undefined
      ? `; user preference "${input.userPreference}" is not among the eligible editors, so the deterministic winner was chosen`
      : "";
  return {
    editorId: best.editorId,
    integrationLevel: best.integrationLevel,
    rationale:
      `deterministic choice: highest integration level (${best.integrationLevel}) among ${eligible.length} ` +
      `eligible editor(s) for "${input.operation}" (required ${requiredLevel}), ties broken by ascending ` +
      `editorId; license ${best.licensing} permits the usage${preferenceNote}`,
  };
}
