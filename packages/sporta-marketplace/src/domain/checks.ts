/**
 * W9B-1 — the declared automated check lane (domain layer — pure).
 *
 * `DeclaredTransformCheckRunner` implements `TransformCheckRunnerPort`
 * by executing the five declared checks plus the similarity trigger
 * over the actual candidate record (SPEC W9B-1 table). The
 * structural checks (graph-validation incl. the sandbox law,
 * digest-integrity, license-presence, sbom-presence) are REAL logic
 * over the record — evidenceKind "measured". The signal-fed checks
 * (unsafe-dependency-signal, similarity-signal) carry the injected
 * source's honesty grade — "fixture" until a real scanner plugs the
 * same seam. Checks NEVER approve: approval is a human decision only
 * (P9-08); similarity may WARN as a review trigger, never clear
 * (P9-16). An unresolvable manifest fails every manifest-dependent
 * check — never silently skipped (fail-closed).
 */
import type { ContentHash } from "@sporta/contracts/contract";
import type {
  TransformPipelineManifest,
  TransformReleaseCandidate,
} from "@sporta/transforms/contract";
import { validateTransformPipelineManifest } from "@sporta/transforms/contract";
import type {
  MarketplaceClock,
  MarketplaceHashPort,
  TransformAutomatedCheck,
  TransformAutomatedCheckReport,
  TransformCheckRunnerPort,
  TransformDependencySignalSource,
  TransformSimilaritySignalSource,
} from "./ports.js";
import { stableStringify } from "./stable.js";

/** The declared automated check ids, in deterministic order. */
export const DECLARED_AUTOMATED_CHECK_IDS: readonly string[] = [
  "graph-validation",
  "digest-integrity",
  "license-presence",
  "sbom-presence",
  "unsafe-dependency-signal",
  "similarity-signal",
];

/** Similarity at/above this score warns (a review trigger, P9-16). */
export const SIMILARITY_WARN_THRESHOLD = 0.85;

const SHA256_PATTERN = /^sha256:[0-9a-f]{64}$/;

/** Constructor dependencies — every external fact is injected. */
export interface DeclaredTransformCheckRunnerDeps {
  clock: MarketplaceClock;
  hash: MarketplaceHashPort;
  dependencySignals: TransformDependencySignalSource;
  similaritySignals: TransformSimilaritySignalSource;
}

/** Recompute the frozen candidate digest (the freeze law, P9-07). */
export function computeCandidateDigest(
  hash: MarketplaceHashPort,
  candidate: TransformReleaseCandidate,
): ContentHash {
  return hash.text(stableStringify(candidate));
}

/** The declared check runner (pure; signal sources injected). */
export class DeclaredTransformCheckRunner implements TransformCheckRunnerPort {
  private readonly deps: DeclaredTransformCheckRunnerDeps;

  constructor(deps: DeclaredTransformCheckRunnerDeps) {
    this.deps = deps;
  }

  runChecks(
    candidate: TransformReleaseCandidate,
    frozenDigest: ContentHash,
    manifest: TransformPipelineManifest | null,
  ): TransformAutomatedCheckReport {
    const checks: TransformAutomatedCheck[] = [
      this.graphValidation(manifest),
      this.digestIntegrity(candidate, frozenDigest),
      this.licensePresence(manifest),
      this.sbomPresence(candidate),
      this.unsafeDependencySignal(manifest),
      this.similaritySignal(candidate),
    ];
    const ranAt = this.deps.clock.now();
    return {
      candidateDigest: frozenDigest,
      ranAt,
      checks,
      clean: checks.every((check) => check.outcome !== "fail"),
    };
  }

  /** Graph validation via the sporta-transforms seam + sandbox law. */
  private graphValidation(manifest: TransformPipelineManifest | null): TransformAutomatedCheck {
    if (manifest === null) {
      return fail("graph-validation", "measured", "pinned manifest could not be re-resolved — validation impossible");
    }
    const validation = validateTransformPipelineManifest(manifest);
    if (!validation.valid) {
      const first = validation.violations[0];
      return fail(
        "graph-validation",
        "measured",
        `typed DAG validation failed: ${validation.violations.length} violation(s); first: ${first?.kind} — ${first?.detail}`,
      );
    }
    const secretGrants = manifest.nodes.filter((node) => node.sandbox.hostSecretAccess !== false);
    if (secretGrants.length > 0) {
      return fail(
        "graph-validation",
        "measured",
        `node(s) ${secretGrants.map((node) => node.nodeId).join(", ")} request host secret access — not approvable in the first slice`,
      );
    }
    return pass("graph-validation", "measured", `valid typed DAG (${validation.nodeCount} nodes, ${validation.edgeCount} edges); no host secret access declared`);
  }

  /** Freeze integrity: digest well-formedness + stored-record recompute. */
  private digestIntegrity(candidate: TransformReleaseCandidate, frozenDigest: ContentHash): TransformAutomatedCheck {
    const malformed = [
      candidate.manifestDigest,
      ...candidate.contentHashes.map((entry) => entry.digest),
    ].filter((digest) => !SHA256_PATTERN.test(digest));
    if (malformed.length > 0) {
      return fail("digest-integrity", "measured", `malformed digests: ${malformed.join(", ")}`);
    }
    const recomputed = computeCandidateDigest(this.deps.hash, candidate);
    if (recomputed !== frozenDigest) {
      return fail(
        "digest-integrity",
        "measured",
        `stored candidate recomputes to ${recomputed} but the frozen digest is ${frozenDigest} — record drift`,
      );
    }
    return pass(
      "digest-integrity",
      "measured",
      `all ${candidate.contentHashes.length} content hash(es) well-formed; frozen digest ${frozenDigest} re-verified over the stored record`,
    );
  }

  /** License declarations present on the manifest and pinned deps. */
  private licensePresence(manifest: TransformPipelineManifest | null): TransformAutomatedCheck {
    if (manifest === null) {
      return fail("license-presence", "measured", "pinned manifest could not be re-resolved — licenses unverifiable");
    }
    if (manifest.licensing.license.trim().length === 0) {
      return fail("license-presence", "measured", "manifest declares no top-level license");
    }
    const unlicensed = manifest.pinnedDependencies.filter(
      (dependency) => dependency.license.trim().length === 0,
    );
    if (unlicensed.length > 0) {
      return fail(
        "license-presence",
        "measured",
        `pinned dependencies without licenses: ${unlicensed.map((dependency) => dependency.name).join(", ")}`,
      );
    }
    return pass(
      "license-presence",
      "measured",
      `license "${manifest.licensing.license}" plus ${manifest.pinnedDependencies.length} pinned dependency license(s) declared`,
    );
  }

  /** SBOM attestation present on the candidate (P9-13). */
  private sbomPresence(candidate: TransformReleaseCandidate): TransformAutomatedCheck {
    const sbom = candidate.attestations.filter((attestation) => attestation.kind === "sbom");
    if (sbom.length === 0) {
      return fail("sbom-presence", "measured", "candidate carries no sbom attestation");
    }
    return pass("sbom-presence", "measured", `sbom attestation present (${sbom.map((entry) => entry.reference).join(", ")})`);
  }

  /** Unsafe-dependency signals over every pinned dependency. */
  private unsafeDependencySignal(manifest: TransformPipelineManifest | null): TransformAutomatedCheck {
    if (manifest === null) {
      return fail("unsafe-dependency-signal", "measured", "pinned manifest could not be re-resolved — dependencies unverifiable");
    }
    const signals = this.deps.dependencySignals.signalsFor(
      manifest.pinnedDependencies.map((dependency) => ({ name: dependency.name, digest: dependency.digest })),
    );
    const flagged = signals.filter((signal) => signal.flagged);
    const firstSignal = signals[0];
    const evidenceKind = firstSignal !== undefined ? firstSignal.evidenceKind : "fixture";
    if (flagged.length > 0) {
      return fail(
        "unsafe-dependency-signal",
        evidenceKind,
        `flagged dependencies: ${flagged.map((signal) => `${signal.name} (${signal.detail})`).join(", ")}`,
      );
    }
    return pass(
      "unsafe-dependency-signal",
      evidenceKind,
      `${signals.length} pinned dependency signal(s) checked, none flagged`,
    );
  }

  /**
   * The similarity trigger (P9-16): at/above the threshold the check
   * WARNS — a review trigger. It never approves, never clears, never
   * substitutes for the human rights review.
   */
  private similaritySignal(candidate: TransformReleaseCandidate): TransformAutomatedCheck {
    const signal = this.deps.similaritySignals.similarityFor(candidate);
    if (signal.score >= SIMILARITY_WARN_THRESHOLD) {
      return {
        checkId: "similarity-signal",
        outcome: "warn",
        evidenceKind: signal.evidenceKind,
        detail: `similarity ${signal.score} at/above threshold ${SIMILARITY_WARN_THRESHOLD} — human rights review required (${signal.detail}); similarity is never clearance`,
      };
    }
    return {
      checkId: "similarity-signal",
      outcome: "pass",
      evidenceKind: signal.evidenceKind,
      detail: `similarity ${signal.score} below threshold ${SIMILARITY_WARN_THRESHOLD} (${signal.detail}); similarity is a quality signal only, never clearance`,
    };
  }
}

function pass(checkId: string, evidenceKind: "measured" | "fixture", detail: string): TransformAutomatedCheck {
  return { checkId, outcome: "pass", evidenceKind, detail };
}

function fail(checkId: string, evidenceKind: "measured" | "fixture", detail: string): TransformAutomatedCheck {
  return { checkId, outcome: "fail", evidenceKind, detail };
}
