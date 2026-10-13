/**
 * sporta-marketplace domain ports (pure declarations, no IO).
 *
 * Every external fact enters through these seams (the sporta-work
 * and sporta-transforms domain/ports.ts precedent): hashing, clocks,
 * transform manifest reads, dependency-risk signals and similarity
 * signals. Adapters (src/adapters) implement; app-layer services
 * consume. The settlement seam lives in domain/paymentPort.ts
 * (W9B-3). No provider, store or scanner owns approval — Sporta
 * records do (lock 28).
 */
import type { ContentHash, Iso8601, SportaId } from "@sporta/contracts/contract";
import type { TransformPipelineManifest, TransformReleaseCandidate } from "@sporta/transforms/contract";

/** Injectable clock — record timestamps never read ambient time. */
export interface MarketplaceClock {
  now(): Iso8601;
}

/** Injectable hashing (domain stays crypto-free). */
export interface MarketplaceHashPort {
  text(value: string): ContentHash;
}

/**
 * W9B-1 — reads the pinned pipeline manifest behind a release
 * candidate. The TL serializes the real seam to the transform store;
 * tests wire a fixture store. Returning null means the pinned
 * manifest cannot be re-resolved — every manifest-dependent
 * automated check then FAILS CLOSED (never silently skips).
 */
export interface TransformManifestReadPort {
  readManifest(ref: {
    pipelineId: SportaId;
    version: string;
    manifestDigest: ContentHash;
  }): TransformPipelineManifest | null;
}

/** One dependency-risk signal (the scanner's honest answer). */
export interface TransformDependencySignal {
  name: string;
  flagged: boolean;
  evidenceKind: "measured" | "fixture";
  detail: string;
}

/**
 * W9B-1 — provider-neutral dependency-risk source behind the
 * unsafe-dependency-signal check. Real scanners plug the same seam;
 * the fixture adapter is deterministic and labeled.
 */
export interface TransformDependencySignalSource {
  signalsFor(dependencies: readonly { name: string; digest: string }[]): readonly TransformDependencySignal[];
}

/** One similarity observation (a quality signal, never clearance). */
export interface TransformSimilaritySignal {
  /** Normalized 0..1 similarity score. */
  score: number;
  evidenceKind: "measured" | "fixture";
  detail: string;
}

/**
 * W9B-1 — provider-neutral similarity source behind the
 * similarity-signal check (P9-16): a WARN trigger for human review,
 * never an approval and never legal clearance.
 */
export interface TransformSimilaritySignalSource {
  similarityFor(candidate: TransformReleaseCandidate): TransformSimilaritySignal;
}

/** The typed outcome of one declared automated check. */
export interface TransformAutomatedCheck {
  checkId: string;
  outcome: "pass" | "fail" | "warn";
  evidenceKind: "measured" | "fixture";
  /** Machine-readable detail; never a hidden pass. */
  detail: string;
}

/** The full report of one automated check run over a candidate. */
export interface TransformAutomatedCheckReport {
  candidateDigest: ContentHash;
  ranAt: Iso8601;
  checks: readonly TransformAutomatedCheck[];
  /** True exactly when no check failed (warns allowed). */
  clean: boolean;
}

/**
 * W9B-1 — the automated check lane port. Implementations execute the
 * declared checks over the candidate and produce typed outcomes with
 * evidence kinds. Checks NEVER approve — approval is a human
 * decision only (P9-08).
 */
export interface TransformCheckRunnerPort {
  runChecks(
    candidate: TransformReleaseCandidate,
    frozenDigest: ContentHash,
    manifest: TransformPipelineManifest | null,
  ): TransformAutomatedCheckReport;
}
