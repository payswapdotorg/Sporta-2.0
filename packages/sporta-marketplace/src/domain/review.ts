/**
 * W9B-1 — the human review law (domain layer — pure).
 *
 * Review gates are a PURE FUNCTION OF THE CANDIDATE — the offer and
 * price are not inputs (offers attach to listings AFTER approval),
 * so free and paid releases share equal gates (lock 29, P9-11).
 * Approval requires ALL three roles (product/rights/security), each
 * signed exactly once with reviewer identity and timestamp. Fixture
 * reviewers are fine in tests — the RECORD shape is what is real.
 * The durable decision pins the exact candidate digest and the
 * automated check triples (the frozen TransformReviewDecision).
 */
import type { ContentHash, Iso8601, SportaId } from "@sporta/contracts/contract";
import type { TransformReleaseCandidate } from "@sporta/transforms/contract";
import type { TransformAutomatedCheckReport } from "./ports.js";
import { DECLARED_AUTOMATED_CHECK_IDS } from "./checks.js";
import type { TransformReviewDecision } from "@sporta/marketplace/contract";

/** The human roles every release must carry before publication. */
export const REQUIRED_REVIEW_ROLES: readonly string[] = ["product", "rights", "security"];

/** One human signoff (the frozen decision's humanReview entry). */
export interface TransformHumanReviewEntry {
  role: string;
  reviewer: string;
  reviewedAt: Iso8601;
}

/** The gate set a candidate must pass — offer-independent (lock 29). */
export interface TransformReviewGateSet {
  automatedCheckIds: readonly string[];
  humanRoles: readonly string[];
}

/**
 * The required gates for a candidate: the declared automated checks
 * plus the three human roles. Pure — identical for free and paid
 * releases because the offer is not an input.
 */
export function requiredReviewGates(_candidate: TransformReleaseCandidate): TransformReviewGateSet {
  return {
    automatedCheckIds: [...DECLARED_AUTOMATED_CHECK_IDS],
    humanRoles: [...REQUIRED_REVIEW_ROLES],
  };
}

/** Validation outcome for a human review signoff list. */
export type HumanReviewValidation =
  | { ok: true; reviews: readonly TransformHumanReviewEntry[] }
  | { ok: false; reason: "missing-required-role" | "duplicate-role" | "malformed-signoff"; detail: string };

/**
 * Validate a human signoff list (fail-closed). In `full` mode every
 * required role must be present exactly once (the approval law); in
 * `partial` mode at least one well-formed signoff suffices
 * (changes-requested/rejected still require a human on record).
 */
export function validateHumanReview(
  reviews: readonly TransformHumanReviewEntry[],
  mode: "full" | "partial" = "full",
): HumanReviewValidation {
  const seen = new Map<string, TransformHumanReviewEntry>();
  for (const review of reviews) {
    if (seen.has(review.role)) {
      return {
        ok: false,
        reason: "duplicate-role",
        detail: `role "${review.role}" signed more than once (by ${seen.get(review.role)?.reviewer} and ${review.reviewer})`,
      };
    }
    if (review.reviewer.trim().length === 0 || review.reviewedAt.trim().length === 0) {
      return {
        ok: false,
        reason: "malformed-signoff",
        detail: `role "${review.role}" signoff carries no reviewer identity or timestamp — the record shape is the evidence`,
      };
    }
    seen.set(review.role, review);
  }
  if (mode === "partial") {
    if (reviews.length === 0) {
      return {
        ok: false,
        reason: "missing-required-role",
        detail: "changes-requested/rejected decisions require at least one human signoff",
      };
    }
    return { ok: true, reviews };
  }
  const missing = REQUIRED_REVIEW_ROLES.filter((role) => !seen.has(role));
  if (missing.length > 0) {
    return {
      ok: false,
      reason: "missing-required-role",
      detail: `required role(s) not signed: ${missing.join(", ")}`,
    };
  }
  return { ok: true, reviews };
}

/** Input for assembling one durable review decision. */
export interface AssembleReviewDecisionInput {
  candidate: TransformReleaseCandidate;
  candidateDigest: ContentHash;
  checkReport: TransformAutomatedCheckReport;
  humanReview: readonly TransformHumanReviewEntry[];
  outcome: "approved" | "changes-requested" | "rejected";
  policyVersion: string;
  rationale: string;
  evidenceRefs: readonly string[];
  decidedAt: Iso8601;
  decisionId: SportaId;
}

/**
 * Assemble the frozen `TransformReviewDecision` from the parts. The
 * automated checks are stripped to the frozen triples (checkId,
 * outcome, evidenceKind); the human signoffs are carried verbatim.
 * Purity law: assembly validates NOTHING — the service layer owns
 * the fail-closed gates; this only shapes the durable record.
 */
export function assembleReviewDecision(input: AssembleReviewDecisionInput): TransformReviewDecision {
  return {
    decisionId: input.decisionId,
    candidateDigest: input.candidateDigest,
    pipelineId: input.candidate.pipelineId,
    version: input.candidate.version,
    automatedChecks: input.checkReport.checks.map((check) => ({
      checkId: check.checkId,
      outcome: check.outcome,
      evidenceKind: check.evidenceKind,
    })),
    humanReview: input.humanReview.map((review) => ({ ...review })),
    outcome: input.outcome,
    policyVersion: input.policyVersion,
    decidedAt: input.decidedAt,
    rationale: input.rationale,
    evidenceRefs: [...input.evidenceRefs],
  };
}
