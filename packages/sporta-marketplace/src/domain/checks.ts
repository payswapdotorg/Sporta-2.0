/**
 * The automated check lane (domain — pure, P9-08/13/16).
 *
 * Declared checks over a SUBMITTED candidate produce typed
 * pass/fail/warn outcomes with evidence kind. The registry is explicit
 * and versioned; `gate` checks block advancement on failure, `signal`
 * checks can only WARN (similarity is a review trigger, never an
 * approval — P9-16). The lane itself has NO approval concept: approval
 * exists only as a human TransformReviewDecision.
 *
 * Runtime values (the w9a graph validator) are INJECTED functions so the
 * domain never pulls runtime values from the public contract
 * (type-only imports — the w9a domain law).
 */
import type { ContentHash, Iso8601, SportaId } from "@sporta/marketplace/contract";
import type {
  TransformGraphValidation,
  TransformPipelineManifest,
} from "@sporta/transforms/contract";
import type { TransformCandidateRecord } from "./lifecycle.js";

/** The role a declared check plays in the lane. */
export type TransformCheckRole = "gate" | "signal";

/** One declared check in the explicit registry (versioned, auditable). */
export interface TransformCheckDefinition {
  readonly checkId: string;
  readonly role: TransformCheckRole;
  readonly description: string;
}

/**
 * The explicit check registry (SPEC W9B-1 table). Order is the
 * deterministic execution order. Adding/removing a check is a
 * SPEC-visible change, never an ambient heuristic.
 */
export const TRANSFORM_AUTOMATED_CHECK_REGISTRY: readonly TransformCheckDefinition[] = [
  {
    checkId: "graph-validation",
    role: "gate",
    description: "the pinned manifest passes typed DAG validation (w9a validator)",
  },
  {
    checkId: "digest-integrity",
    role: "gate",
    description: "recomputed candidate digest equals the frozen submission digest",
  },
  {
    checkId: "license-presence",
    role: "gate",
    description: "manifest licensing and every pinned dependency declare a license",
  },
  {
    checkId: "sbom-presence",
    role: "gate",
    description: "candidate attestations carry an SBOM reference (P9-13)",
  },
  {
    checkId: "unsafe-dependency-signal",
    role: "gate",
    description:
      "pinned dependencies resolve in the dependency-signal source (unsafe fails, unknown warns)",
  },
  {
    checkId: "similarity-signal",
    role: "signal",
    description:
      "similarity evidence is a review TRIGGER only — this check can warn, never approve (P9-16)",
  },
];

/** One typed check outcome (frozen decision entry shape + detail). */
export interface TransformAutomatedCheckResult {
  readonly checkId: string;
  readonly outcome: "pass" | "fail" | "warn";
  readonly evidenceKind: "measured" | "fixture";
  readonly detail: string;
}

/** Dependency supply-chain signal (fixture source in the first slice). */
export type TransformDependencySignal = "clean" | "unknown" | "unsafe";

/** Injected signal sources + validator + recomputed digest (all inputs). */
export interface TransformCheckLaneInput {
  /** The SUBMITTED candidate (frozen digest required — narrowed type). */
  readonly candidate: TransformCandidateRecord & { readonly candidateDigest: ContentHash };
  /** Manifest resolved through the read port; null = unresolvable (fail-closed). */
  readonly manifest: TransformPipelineManifest | null;
  /** Digest recomputed by the caller through the injected hash port. */
  readonly recomputedCandidateDigest: ContentHash;
  /** Dependency-name -> signal record (the injected source). */
  readonly dependencySignals: Readonly<Record<string, TransformDependencySignal>>;
  /** Similarity evidence, when present (a review trigger). */
  readonly similaritySignal: { readonly present: boolean; readonly note: string } | null;
  /** The w9a graph validator, injected (domain stays runtime-pure). */
  readonly validateGraph: (manifest: TransformPipelineManifest) => TransformGraphValidation;
}

/** The durable check-lane record (one per run of the lane). */
export interface TransformCheckLaneRecord {
  readonly laneId: SportaId;
  readonly candidateId: SportaId;
  readonly candidateDigest: ContentHash;
  readonly ranAt: Iso8601;
  readonly results: readonly TransformAutomatedCheckResult[];
}

/** Check-lane store port (append; latest per candidate/digest). */
export interface CheckLaneStorePort {
  append(record: TransformCheckLaneRecord): void;
  byCandidate(candidateId: SportaId): TransformCheckLaneRecord | null;
  byCandidateDigest(candidateDigest: ContentHash): TransformCheckLaneRecord | null;
}

/** Gate check ids that FAILED in a lane (blocking, deterministic order). */
export function failedGateCheckIds(results: readonly TransformAutomatedCheckResult[]): string[] {
  const roles = new Map(
    TRANSFORM_AUTOMATED_CHECK_REGISTRY.map((check) => [check.checkId, check.role]),
  );
  return results
    .filter((result) => result.outcome === "fail" && roles.get(result.checkId) === "gate")
    .map((result) => result.checkId);
}

/**
 * Run every declared check over the candidate (pure, total,
 * deterministic registry order). Fail-closed law: an unresolvable
 * manifest fails graph-validation AND license-presence (never
 * "assume fine"); an unknown dependency signal WARNS — absence of
 * evidence is not safety; similarity only ever warns.
 */
export function runDeclaredChecks(
  input: TransformCheckLaneInput,
): readonly TransformAutomatedCheckResult[] {
  const results: TransformAutomatedCheckResult[] = [];

  // graph-validation (gate, measured — the real validator run).
  if (input.manifest === null) {
    results.push({
      checkId: "graph-validation",
      outcome: "fail",
      evidenceKind: "measured",
      detail: "manifest unresolvable through the read port — fail-closed",
    });
  } else {
    const validation = input.validateGraph(input.manifest);
    if (validation.valid) {
      results.push({
        checkId: "graph-validation",
        outcome: "pass",
        evidenceKind: "measured",
        detail: `typed DAG validation passed (${validation.nodeCount} nodes, ${validation.edgeCount} edges)`,
      });
    } else {
      results.push({
        checkId: "graph-validation",
        outcome: "fail",
        evidenceKind: "measured",
        detail: `typed DAG validation failed: ${validation.violations
          .map((violation) => `${violation.kind}(${violation.detail})`)
          .join("; ")}`,
      });
    }
  }

  // digest-integrity (gate, measured — real recomputation by the caller).
  results.push(
    input.recomputedCandidateDigest === input.candidate.candidateDigest
      ? {
          checkId: "digest-integrity",
          outcome: "pass",
          evidenceKind: "measured",
          detail: "recomputed candidate digest equals the frozen submission digest",
        }
      : {
          checkId: "digest-integrity",
          outcome: "fail",
          evidenceKind: "measured",
          detail: `recomputed ${input.recomputedCandidateDigest} != frozen ${input.candidate.candidateDigest}`,
        },
  );

  // license-presence (gate, fixture — declared licensing fields).
  const missingLicenses: string[] = [];
  if (input.manifest === null) {
    missingLicenses.push("manifest-unresolved");
  } else {
    if (input.manifest.licensing.license.trim().length === 0)
      missingLicenses.push("manifest.licensing.license");
    for (const dependency of input.manifest.pinnedDependencies) {
      if (dependency.license.trim().length === 0) missingLicenses.push(dependency.name);
    }
  }
  results.push({
    checkId: "license-presence",
    outcome: missingLicenses.length === 0 ? "pass" : "fail",
    evidenceKind: "fixture",
    detail:
      missingLicenses.length === 0
        ? "manifest licensing and all pinned dependencies declare licenses"
        : `missing license declarations: ${missingLicenses.join(", ")}`,
  });

  // sbom-presence (gate, fixture — attestation presence).
  const hasSbom = input.candidate.attestations.some((attestation) => attestation.kind === "sbom");
  results.push({
    checkId: "sbom-presence",
    outcome: hasSbom ? "pass" : "fail",
    evidenceKind: "fixture",
    detail: hasSbom
      ? "candidate attestations carry an SBOM reference"
      : "no attestation of kind 'sbom' on the candidate (P9-13)",
  });

  // unsafe-dependency-signal (gate, fixture — injected signal source).
  const dependencies =
    input.manifest === null ? [] : input.manifest.pinnedDependencies.map((dep) => dep.name);
  const unsafe: string[] = [];
  const unknown: string[] = [];
  for (const name of dependencies) {
    const signal = input.dependencySignals[name];
    if (signal === "unsafe") unsafe.push(name);
    else if (signal !== "clean") unknown.push(name);
  }
  results.push({
    checkId: "unsafe-dependency-signal",
    outcome: unsafe.length > 0 ? "fail" : unknown.length > 0 ? "warn" : "pass",
    evidenceKind: "fixture",
    detail:
      unsafe.length > 0
        ? `unsafe dependency signals: ${unsafe.join(", ")}`
        : unknown.length > 0
          ? `no signal for dependencies (absence of evidence is not safety): ${unknown.join(", ")}`
          : dependencies.length === 0
            ? "no pinned dependencies declared"
            : "every pinned dependency resolves clean in the signal source",
  });

  // similarity-signal (signal role, fixture — WARN only, never approves).
  results.push({
    checkId: "similarity-signal",
    outcome: input.similaritySignal !== null && input.similaritySignal.present ? "warn" : "pass",
    evidenceKind: "fixture",
    detail:
      input.similaritySignal !== null && input.similaritySignal.present
        ? `similarity evidence present — REVIEW TRIGGER ONLY, never clearance: ${input.similaritySignal.note}`
        : "no similarity evidence supplied (similarity is a trigger, not a clearance)",
  });

  return results;
}
