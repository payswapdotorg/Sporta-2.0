/**
 * Population derivation — pure mapping of registry entries to Lab
 * population candidates (see packages/sporta-lab/SPEC.md for the declared
 * Wave 1 heuristics; deterministic, fixture-grade).
 */
import type { OrganizationVersionRecord } from "@sporta/contracts/contract";
import type { LabPopulationKind } from "./ports.js";
import { LabPopulationKindError } from "./errors.js";

/** The closed population-kind union, declaration order. */
export const POPULATION_KINDS: readonly LabPopulationKind[] = [
  "baseline-generalist",
  "specialist",
  "historical-winner",
  "personalized",
  "hand-authored",
  "arena-improved",
  "experimentally-evolved",
];

function includesToken(profile: string, token: string): boolean {
  return profile
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .includes(token);
}

/** Does one registry entry belong to a population kind? (declared heuristic) */
function matchesPopulation(
  entry: { record: OrganizationVersionRecord; promoted: boolean },
  kind: LabPopulationKind,
): boolean {
  const { record } = entry;
  switch (kind) {
    case "baseline-generalist":
      return includesToken(record.intentProfile, "generalist");
    case "specialist":
      return includesToken(record.intentProfile, "specialist");
    case "historical-winner":
      return entry.promoted && record.evidence.length > 0;
    case "personalized":
      return record.learnedPreferences.length > 0;
    case "hand-authored":
      return includesToken(record.intentProfile, "authored");
    case "arena-improved":
      return record.evidence.some((id) => id.startsWith("arena"));
    case "experimentally-evolved":
      return includesToken(record.intentProfile, "evolved");
  }
}

/** Validate requested kinds against the closed union. */
export function assertPopulationKinds(requested: readonly string[]): void {
  const known = new Set<string>(POPULATION_KINDS);
  const unknown = requested.filter((kind) => !known.has(kind));
  if (unknown.length > 0) {
    throw new LabPopulationKindError(
      `unknown population kind(s): ${unknown.join(", ")} (known: ${POPULATION_KINDS.join(", ")})`,
    );
  }
}

export interface LabPopulationCandidate {
  record: OrganizationVersionRecord;
  /** All requested kinds this candidate matched, declaration order. */
  populations: readonly LabPopulationKind[];
}

/**
 * Derive the population: candidates matching at least one requested kind,
 * deduped per (organizationId, version), sorted by (organizationId asc,
 * version asc). Deterministic.
 */
export function derivePopulationCandidates(
  entries: readonly { record: OrganizationVersionRecord; promoted: boolean }[],
  requested: readonly LabPopulationKind[],
): readonly LabPopulationCandidate[] {
  const matched = new Map<string, LabPopulationCandidate>();
  for (const entry of entries) {
    const populations = POPULATION_KINDS.filter(
      (kind) => requested.includes(kind) && matchesPopulation(entry, kind),
    );
    if (populations.length === 0) continue;
    const key = `${entry.record.organizationId}#${entry.record.version}`;
    if (!matched.has(key)) {
      matched.set(key, { record: entry.record, populations });
    }
  }
  return [...matched.values()].sort(
    (left, right) =>
      left.record.organizationId.localeCompare(right.record.organizationId) ||
      left.record.version - right.record.version,
  );
}
