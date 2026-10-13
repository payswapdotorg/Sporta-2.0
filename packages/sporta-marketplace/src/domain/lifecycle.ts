/**
 * Candidate + listing lifecycle (domain — pure state machines and
 * classification, the compute-fallback law: explicit transition tables,
 * total typed classification, never ambient heuristics).
 *
 * Candidate: DRAFT -> SUBMITTED -> AUTOMATED_CHECKS -> HUMAN_REVIEW ->
 * APPROVED -> PUBLISHED, with terminal CHANGES_REQUESTED / REJECTED
 * (docs/architecture ADR publication lifecycle).
 * Listing: PUBLISHED -> SUSPENDED | WITHDRAWN | SUPERSEDED (one-way in
 * this slice; reactivation is a TL seam).
 */
import type {
  ContentHash,
  Iso8601,
  SportaId,
  TransformCandidateLifecycleState,
  TransformListingState,
  TransformReleaseCandidate,
} from "@sporta/marketplace/contract";
import { TransformLifecycleError } from "./errors.js";

/**
 * The explicit candidate transition table. Every legal edge is recorded
 * here; ANY other transition throws the typed lifecycle error — there is
 * no silent default, no "advance anyway".
 */
const CANDIDATE_TRANSITIONS: Readonly<
  Record<TransformCandidateLifecycleState, readonly TransformCandidateLifecycleState[]>
> = {
  DRAFT: ["SUBMITTED"],
  SUBMITTED: ["AUTOMATED_CHECKS", "REJECTED", "CHANGES_REQUESTED"],
  AUTOMATED_CHECKS: ["HUMAN_REVIEW", "REJECTED", "CHANGES_REQUESTED"],
  HUMAN_REVIEW: ["APPROVED", "REJECTED", "CHANGES_REQUESTED"],
  APPROVED: ["PUBLISHED"],
  PUBLISHED: [],
  CHANGES_REQUESTED: [],
  REJECTED: [],
};

/** The explicit listing transition table (one-way in this slice). */
const LISTING_TRANSITIONS: Readonly<
  Record<TransformListingState, readonly TransformListingState[]>
> = {
  PUBLISHED: ["SUSPENDED", "WITHDRAWN", "SUPERSEDED"],
  SUSPENDED: [],
  WITHDRAWN: [],
  SUPERSEDED: [],
};

/** Advance the candidate lifecycle (pure; throws on illegal edges). */
export function advanceCandidate(
  from: TransformCandidateLifecycleState,
  to: TransformCandidateLifecycleState,
): void {
  const legal = CANDIDATE_TRANSITIONS[from];
  if (!legal.includes(to)) {
    throw new TransformLifecycleError(
      `candidate lifecycle cannot transition ${from} -> ${to} (legal: ${legal.join(", ") || "terminal"})`,
      from,
      to,
    );
  }
}

/** Advance the listing lifecycle (pure; throws on illegal edges). */
export function advanceListing(from: TransformListingState, to: TransformListingState): void {
  const legal = LISTING_TRANSITIONS[from];
  if (!legal.includes(to)) {
    throw new TransformLifecycleError(
      `listing lifecycle cannot transition ${from} -> ${to} (legal: ${legal.join(", ") || "terminal"})`,
      from,
      to,
    );
  }
}

/**
 * The additive candidate record: the frozen `TransformReleaseCandidate`
 * wrapped with marketplace-owned lifecycle state. DRAFT records carry a
 * NULL digest (nothing is frozen yet — drafts are private and mutable);
 * SUBMISSION freezes the digest ONCE and the record becomes immutable
 * (P9-07/09).
 */
export interface TransformCandidateRecord {
  readonly candidateId: SportaId;
  readonly pipelineId: SportaId;
  readonly version: string;
  /** Frozen at SUBMISSION; null while DRAFT. */
  readonly candidateDigest: ContentHash | null;
  readonly manifestDigest: ContentHash;
  readonly contentHashes: readonly { kind: string; digest: ContentHash }[];
  readonly attestations: readonly { kind: string; reference: string }[];
  readonly submittedBy: string;
  readonly lifecycle: TransformCandidateLifecycleState;
  readonly createdAt: Iso8601;
  readonly submittedAt: Iso8601 | null;
}

/** Build a DRAFT record from a candidate-shaped input (no digest yet). */
export function draftCandidateRecord(
  candidate: Omit<TransformReleaseCandidate, "submittedAt" | "candidateId">,
  candidateId: SportaId,
  createdAt: Iso8601,
): TransformCandidateRecord {
  return {
    candidateId,
    pipelineId: candidate.pipelineId,
    version: candidate.version,
    candidateDigest: null,
    manifestDigest: candidate.manifestDigest,
    contentHashes: candidate.contentHashes,
    attestations: candidate.attestations,
    submittedBy: candidate.submittedBy,
    lifecycle: "DRAFT",
    createdAt,
    submittedAt: null,
  };
}

/**
 * The material-change families (P9-09): code/model/dependency/runtime
 * digests, source, license, SBOM, manifest. Any of these changing
 * between two candidates of the same pipeline makes the new candidate a
 * NEW version requiring separate review.
 */
export type TransformMaterialChangeKind =
  | "manifest"
  | "code"
  | "model"
  | "dependency"
  | "runtime"
  | "source"
  | "license"
  | "sbom";

/** Hash kinds mapped to their material-change families. */
const CONTENT_KIND_FAMILIES: Readonly<Record<string, TransformMaterialChangeKind>> = {
  code: "code",
  script: "code",
  source: "source",
  model: "model",
  weights: "model",
  "model-weights": "model",
  dependency: "dependency",
  runtime: "runtime",
  "runtime-image": "runtime",
  test: "source",
};

const ATTESTATION_KIND_FAMILIES: Readonly<Record<string, TransformMaterialChangeKind>> = {
  license: "license",
  "license-attestation": "license",
  "source-attestation": "source",
  sbom: "sbom",
  "sbom-reference": "sbom",
  provenance: "source",
};

/**
 * Total, explicit material-change classification between two candidates
 * of the same pipeline (the fail-closed classification precedent):
 * EVERY digest or attestation difference is material and names its
 * family; identical candidates classify as `[]` (idempotent
 * resubmission). A manifest digest difference alone reports
 * `manifest` plus whatever the content/attestation layers reveal.
 */
export function classifyCandidateMaterialChange(
  prior: {
    manifestDigest: string;
    contentHashes: readonly { kind: string; digest: string }[];
    attestations: readonly { kind: string; reference: string }[];
  },
  next: {
    manifestDigest: string;
    contentHashes: readonly { kind: string; digest: string }[];
    attestations: readonly { kind: string; reference: string }[];
  },
): TransformMaterialChangeKind[] {
  const changed = new Set<TransformMaterialChangeKind>();
  if (prior.manifestDigest !== next.manifestDigest) changed.add("manifest");

  const priorHashes = new Map(prior.contentHashes.map((h) => [`${h.kind}:${h.digest}`, h]));
  for (const hash of next.contentHashes) {
    const key = `${hash.kind}:${hash.digest}`;
    if (!priorHashes.has(key)) {
      changed.add(CONTENT_KIND_FAMILIES[hash.kind] ?? "dependency");
    }
  }
  const nextHashKeys = new Set(next.contentHashes.map((h) => `${h.kind}:${h.digest}`));
  for (const [key, hash] of priorHashes) {
    if (!nextHashKeys.has(key)) {
      changed.add(CONTENT_KIND_FAMILIES[hash.kind] ?? "dependency");
    }
  }

  const priorAttests = new Set(prior.attestations.map((a) => `${a.kind}:${a.reference}`));
  const nextAttests = new Set(next.attestations.map((a) => `${a.kind}:${a.reference}`));
  for (const key of nextAttests) {
    if (!priorAttests.has(key)) {
      const kind = key.slice(0, key.indexOf(":"));
      changed.add(ATTESTATION_KIND_FAMILIES[kind] ?? "source");
    }
  }
  for (const key of priorAttests) {
    if (!nextAttests.has(key)) {
      const kind = key.slice(0, key.indexOf(":"));
      changed.add(ATTESTATION_KIND_FAMILIES[kind] ?? "source");
    }
  }

  return [...changed].sort();
}

/** Simple deterministic semver-ish comparison: > 0 means newer. */
export function compareVersions(a: string, b: string): number {
  const parse = (v: string): number[] =>
    v
      .split(/[.-]/)
      .map((part) => Number.parseInt(part, 10))
      .map((n) => (Number.isNaN(n) ? 0 : n));
  const left = parse(a);
  const right = parse(b);
  const bound = Math.max(left.length, right.length);
  for (let index = 0; index < bound; index += 1) {
    const delta = (left[index] ?? 0) - (right[index] ?? 0);
    if (delta !== 0) return delta;
  }
  return 0;
}
