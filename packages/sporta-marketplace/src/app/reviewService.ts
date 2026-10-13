/**
 * W9B-1 — the review service (app layer). Human review decisions that
 * write the durable frozen `TransformReviewDecision`.
 *
 * Approval is the ONLY path to a listing (P9-08): it requires the
 * automated check lane on record with ZERO failed gate checks AND all
 * three human roles (product / rights / security) signed off with
 * reviewer identity + timestamp. Rejection and changes-requested are
 * terminal for the candidate and prevent publication (P9-10).
 * Post-publication outcomes (suspended/withdrawn) route to the listing
 * service — the single owner of listing state.
 */
import type {
  ContentHash,
  Iso8601,
  SportaId,
  TransformReviewDecision,
  TransformReviewOutcome,
} from "@sporta/marketplace/contract";
import type {
  CandidateStorePort,
  DecisionStorePort,
  MarketplaceClock,
  MarketplaceHashPort,
} from "../domain/ports.js";
import type { CheckLaneStorePort, TransformAutomatedCheckResult } from "../domain/checks.js";
import { TransformReviewError, TransformUnknownRecordError } from "../domain/errors.js";
import { advanceCandidate, type TransformCandidateRecord } from "../domain/lifecycle.js";
import { failedGateCheckIds } from "../domain/checks.js";
import { idFromDigest } from "../domain/stable.js";

/** Constructor dependencies — every IO seam injected. */
export interface ReviewServiceDeps {
  clock: MarketplaceClock;
  hash: MarketplaceHashPort;
  candidates: CandidateStorePort;
  decisions: DecisionStorePort;
  lanes: CheckLaneStorePort;
}

/** One human signoff entry (reviewer identity is real; test reviewers are fixtures). */
export interface HumanReviewEntryInput {
  role: string;
  reviewer: string;
  /** Optional explicit stamp; the injected clock stamps when absent. */
  reviewedAt?: Iso8601;
}

/** Input for one review round. */
export interface RecordReviewDecisionInput {
  candidateId: SportaId;
  outcome: "approved" | "changes-requested" | "rejected";
  humanReview: readonly HumanReviewEntryInput[];
  rationale: string;
  policyVersion: string;
  evidenceRefs?: readonly string[];
}

/** The three canonical signoff roles required for approval (P9-08). */
export const REQUIRED_REVIEW_ROLES: readonly string[] = ["product", "rights", "security"];

export class ReviewService {
  private readonly deps: ReviewServiceDeps;

  constructor(deps: ReviewServiceDeps) {
    this.deps = deps;
  }

  /**
   * Record the durable review decision. Idempotent per (candidate
   * digest, outcome): a durable re-record returns the existing decision
   * unchanged. Approval advances the candidate to APPROVED; rejection
   * and changes-requested move it to the corresponding terminal state.
   */
  recordReviewDecision(input: RecordReviewDecisionInput): TransformReviewDecision {
    const candidate = this.requireCandidate(input.candidateId);
    if (candidate.candidateDigest === null) {
      throw new TransformReviewError(
        `candidate ${input.candidateId} is a DRAFT — submit it before review (P9-07)`,
        "candidate-not-submitted",
      );
    }
    const outcome = input.outcome as TransformReviewOutcome;

    // DURABLE RE-RECORD FIRST: a re-record of an already-rendered
    // decision (same candidate digest + outcome) returns the existing
    // record regardless of the candidate's CURRENT lifecycle — the
    // decision is durable and must survive state advancement.
    const durableId = idFromDigest(
      "dec",
      this.deps.hash.stable([candidate.candidateDigest, outcome]),
    );
    const durableExisting = this.deps.decisions.byId(durableId);
    if (durableExisting !== null && durableExisting.outcome === outcome) {
      return durableExisting;
    }

    if (
      candidate.lifecycle !== "SUBMITTED" &&
      candidate.lifecycle !== "AUTOMATED_CHECKS" &&
      candidate.lifecycle !== "HUMAN_REVIEW"
    ) {
      throw new TransformReviewError(
        `candidate ${input.candidateId} is ${candidate.lifecycle} — only candidates under review receive decisions`,
        "candidate-not-under-review",
      );
    }
    if (outcome === "suspended" || outcome === "withdrawn") {
      throw new TransformReviewError(
        `outcome "${outcome}" acts on published listings — use the listing service (single owner of post-publication state)`,
        "outcome-routes-to-listing-service",
      );
    }

    const lane = this.deps.lanes.byCandidateDigest(candidate.candidateDigest);
    if (lane === null) {
      throw new TransformReviewError(
        `no automated check lane on record for candidate ${input.candidateId} — automated checks precede every human decision (P9-08)`,
        "automated-checks-missing",
      );
    }

    const humanReview = input.humanReview.map((entry) => ({
      role: entry.role,
      reviewer: entry.reviewer,
      reviewedAt: entry.reviewedAt ?? this.deps.clock.now(),
    }));
    for (const entry of humanReview) {
      if (entry.reviewer.trim().length === 0) {
        throw new TransformReviewError(
          `role "${entry.role}" signed off with an empty reviewer identity — reviewer identity is part of the durable record`,
          "missing-reviewer-identity",
        );
      }
    }

    if (outcome === "approved") {
      this.requireApprovalGates(lane.results, humanReview);
    } else if (humanReview.length === 0) {
      throw new TransformReviewError(
        `outcome "${outcome}" still requires at least one human reviewer — decisions are human acts`,
        "missing-reviewer-role",
      );
    }

    const decidedAt = this.deps.clock.now();
    const decisionId = durableId;
    const decision: TransformReviewDecision = {
      decisionId,
      candidateDigest: candidate.candidateDigest,
      pipelineId: candidate.pipelineId,
      version: candidate.version,
      automatedChecks: lane.results.map((result) => ({
        checkId: result.checkId,
        outcome: result.outcome,
        evidenceKind: result.evidenceKind,
      })),
      humanReview,
      outcome,
      policyVersion: input.policyVersion,
      decidedAt,
      rationale: input.rationale,
      evidenceRefs: input.evidenceRefs ?? [],
    };
    this.deps.decisions.append(decision);

    const nextLifecycle =
      outcome === "approved"
        ? "APPROVED"
        : outcome === "rejected"
          ? "REJECTED"
          : "CHANGES_REQUESTED";
    advanceCandidate(candidate.lifecycle, nextLifecycle);
    this.deps.candidates.save({ ...candidate, lifecycle: nextLifecycle });
    return decision;
  }

  /** Read the latest approving decision for an approved candidate digest. */
  latestApprovalForDigest(candidateDigest: ContentHash): TransformReviewDecision | null {
    const decisions = this.deps.decisions.byCandidate(candidateDigest);
    const approved = decisions.filter((decision) => decision.outcome === "approved");
    return approved.length > 0 ? (approved[approved.length - 1] ?? null) : null;
  }

  private requireApprovalGates(
    laneResults: readonly TransformAutomatedCheckResult[],
    humanReview: readonly { role: string; reviewer: string; reviewedAt: Iso8601 }[],
  ): void {
    const failed = failedGateCheckIds(laneResults);
    if (failed.length > 0) {
      throw new TransformReviewError(
        `approval refused: automated gate checks failed (${failed.join(", ")}) — human review cannot approve over a failed gate (P9-08)`,
        "automated-checks-failed",
      );
    }
    const signedRoles = new Set(humanReview.map((entry) => entry.role));
    const missing = REQUIRED_REVIEW_ROLES.filter((role) => !signedRoles.has(role));
    if (missing.length > 0) {
      throw new TransformReviewError(
        `approval refused: missing required reviewer roles: ${missing.join(", ")} (P9-08)`,
        "missing-reviewer-role",
      );
    }
  }

  private requireCandidate(candidateId: SportaId): TransformCandidateRecord {
    const record = this.deps.candidates.byId(candidateId);
    if (record === null) {
      throw new TransformUnknownRecordError(
        `no candidate record ${candidateId}`,
        "candidate",
        candidateId,
      );
    }
    return record;
  }
}
