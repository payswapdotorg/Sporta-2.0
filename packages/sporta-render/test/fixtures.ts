import type {
  PolicySet,
  ProvenanceDescriptor,
  SportsWorldModelRecord,
} from "@sporta/contracts/contract";

/**
 * Fixture-grade snapshot builders for the sporta-render tests.
 *
 * EVIDENCE LABEL: FIXTURE — these inputs are hand-built fixtures shaped
 * like real `WorldModelService.ingestObservations` outputs (sorted
 * unique ids, observation-id uncertainty subjects, the last
 * observation's provenance, an explicit policy). The projections and
 * serializers under test are pure functions executed FOR REAL by the
 * node:test battery (REAL: deterministic execution, real outputs).
 */

/** Deterministic policy with "render" affirmatively permitted. */
export const renderPermittedPolicy: PolicySet = {
  rights: { holders: ["holder:fixture"], usages: ["render", "derive"], prohibitions: [] },
  privacy: { visibility: "tenant", exportableFields: [] },
  retention: { disposition: "retain" },
};

/** Deterministic policy where "render" is prohibited. */
export const renderProhibitedPolicy: PolicySet = {
  rights: { holders: ["holder:fixture"], usages: ["derive"], prohibitions: ["render"] },
  privacy: { visibility: "tenant", exportableFields: [] },
  retention: { disposition: "retain" },
};

/** The default fixture provenance (authorized source, capture anchor). */
export const fixtureProvenance: ProvenanceDescriptor = {
  sourceKind: "authorized-source",
  sourceRef: "camera:1",
  capturedAt: "2026-10-10T12:00:00.000Z",
  confidence: 0.9,
};

/** Overrides for the fixture snapshot builder. */
export interface FixtureSnapshotOverrides {
  readonly domain?: string;
  readonly entities?: readonly string[];
  readonly events?: readonly string[];
  readonly uncertainty?: readonly { subject: string; confidence: number }[];
  readonly provenance?: ProvenanceDescriptor;
  readonly policy?: PolicySet;
}

/**
 * The fixture snapshot: 4 entities, 3 events, observation-keyed
 * uncertainty (ingestion-shaped) PLUS one entity-keyed and one
 * event-keyed entry — the contract type permits any subject id, and
 * the confidence attach rule must exercise both paths.
 */
export function fixtureSnapshot(overrides: FixtureSnapshotOverrides = {}): SportsWorldModelRecord {
  return {
    swmId: `swm:${overrides.domain ?? "football"}`,
    domain: overrides.domain ?? "football",
    snapshotHash: "ab" + "00".repeat(31),
    entities: overrides.entities ?? [
      "entity:away-7",
      "entity:ball",
      "entity:home-1",
      "entity:home-2",
    ],
    events: overrides.events ?? ["evt:e1", "evt:e2", "evt:e3"],
    uncertainty: overrides.uncertainty ?? [
      { subject: "obs:fixture-1", confidence: 0.88 },
      { subject: "obs:fixture-2", confidence: 0.91 },
      { subject: "entity:ball", confidence: 0.5 },
      { subject: "evt:e2", confidence: 0.77 },
    ],
    provenance: overrides.provenance ?? fixtureProvenance,
    policy: overrides.policy ?? renderPermittedPolicy,
  };
}

/**
 * An ingestion-shaped fixture: every uncertainty subject is an
 * observation id (exactly what `WorldModelService` writes — the
 * contract-typical shape; no entity/event attach fires).
 */
export function ingestionShapedSnapshot(): SportsWorldModelRecord {
  return fixtureSnapshot({
    uncertainty: [
      { subject: "obs:fixture-1", confidence: 0.88 },
      { subject: "obs:fixture-2", confidence: 0.91 },
    ],
  });
}

/** Recursive deep freeze (input-purity proofs — strict-mode ESM). */
export function deepFreeze<T>(value: T): T {
  if (Object.isFrozen(value)) return value;
  if (Array.isArray(value)) {
    for (const item of value) deepFreeze(item);
    return Object.freeze(value);
  }
  if (typeof value === "object" && value !== null) {
    for (const key of Object.keys(value)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
    return Object.freeze(value);
  }
  return value;
}

/** Structural clone (JSON round-trip) for non-mutation comparisons. */
export function jsonClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
