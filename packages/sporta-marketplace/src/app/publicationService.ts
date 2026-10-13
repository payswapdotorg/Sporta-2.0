/**
 * W9B-1 — the publication service (app layer). Owns drafts, frozen
 * submissions, automated check reports, review decisions and
 * materiality reports. P9-07: drafts are private and submission
 * freezes the candidate digest — the record becomes immutable; a
 * later edit files a NEW candidate (P9-09). P9-08: automated checks
 * plus human product/rights/security review are required before
 * publication; approval is the only path forward, and it is typed-
 * gated. Fixture-grade in-memory ledgers (honestly labeled); a real
 * store plugs in behind the same constructor.
 */
import type { ContentHash, Iso8601, SportaId } from "@sporta/contracts/contract";
import type {
  TransformReleaseCandidate,
} from "@sporta/transforms/contract";
import { candidateCanTransition } from "../domain/lifecycle.js";
import { computeCandidateDigest } from "../domain/checks.js";
import {
  assembleReviewDecision,
  validateHumanReview,
  type TransformHumanReviewEntry,
} from "../domain/review.js";
import { detectMaterialChange, type TransformMaterialChangeReport } from "../domain/materiality.js";
import {
  MarketplaceReviewError,
  MarketplaceSubmissionError,
} from "../domain/errors.js";
import type {
  MarketplaceClock,
  MarketplaceHashPort,
  TransformAutomatedCheckReport,
  TransformCheckRunnerPort,
  TransformManifestReadPort,
} from "../domain/ports.js";
import { fnv1aHex, stableStringify } from "../domain/stable.js";
import type { TransformReviewDecision } from "@sporta/marketplace/contract";

/** A private, mutable-before-submission draft (P9-07). */
export interface TransformDraftRecord {
  draftId: string;
  pipelineId: SportaId;
  version: string;
  manifestDigest: ContentHash;
  contentHashes: readonly { kind: string; digest: ContentHash }[];
  attestations: readonly { kind: string; reference: string }[];
  createdBy: string;
  createdAt: Iso8601;
  /** Set once submitted — drafts never resurrect. */
  submittedCandidateId: SportaId | null;
}

/** The frozen submission record — the candidate plus its lifecycle. */
export interface TransformSubmissionRecord {
  candidate: TransformReleaseCandidate;
  candidateDigest: ContentHash;
  state:
    | "DRAFT"
    | "SUBMITTED"
    | "AUTOMATED_CHECKS"
    | "HUMAN_REVIEW"
    | "APPROVED"
    | "PUBLISHED"
    | "CHANGES_REQUESTED"
    | "REJECTED";
  checkReport: TransformAutomatedCheckReport | null;
  decisions: readonly TransformReviewDecision[];
  materialChange: TransformMaterialChangeReport | null;
}

/** Constructor dependencies — every IO seam injected. */
export interface PublicationServiceDeps {
  clock: MarketplaceClock;
  hash: MarketplaceHashPort;
  manifests: TransformManifestReadPort;
  checks: TransformCheckRunnerPort;
}

/** Input for one review decision (W9B-1). */
export interface RecordReviewDecisionInput {
  candidateId: SportaId;
  outcome: "approved" | "changes-requested" | "rejected";
  humanReview: readonly TransformHumanReviewEntry[];
  policyVersion: string;
  rationale: string;
  evidenceRefs: readonly string[];
}

/** Draft/submission/review lifecycle owner. */
export class PublicationService {
  private readonly deps: PublicationServiceDeps;
  private readonly drafts = new Map<string, TransformDraftRecord>();
  private readonly submissions = new Map<string, TransformSubmissionRecord>();
  private readonly submissionsByDigest = new Map<string, TransformSubmissionRecord>();

  constructor(deps: PublicationServiceDeps) {
    this.deps = deps;
  }

  /** Register a private draft. Not publicly visible or selectable. */
  registerDraft(input: {
    pipelineId: SportaId;
    version: string;
    manifestDigest: ContentHash;
    contentHashes: readonly { kind: string; digest: ContentHash }[];
    attestations: readonly { kind: string; reference: string }[];
    createdBy: string;
  }): TransformDraftRecord {
    const draftId = `draft:${fnv1aHex(stableStringify({ ...input, at: this.deps.clock.now(), seq: this.drafts.size }))}`;
    const draft: TransformDraftRecord = {
      draftId,
      ...input,
      createdAt: this.deps.clock.now(),
      submittedCandidateId: null,
    };
    this.drafts.set(draftId, draft);
    return draft;
  }

  /** Read a draft by id (the only draft observer — P9-07 privacy). */
  readDraft(draftId: string): TransformDraftRecord | null {
    return this.drafts.get(draftId) ?? null;
  }

  /**
   * Submit a draft: freeze the candidate digest and enter SUBMITTED.
   * The frozen record is immutable — there is no update path.
   */
  submitDraft(draftId: string): TransformSubmissionRecord {
    const draft = this.drafts.get(draftId);
    if (draft === undefined) {
      throw new MarketplaceSubmissionError(`draft ${draftId} not found`, "unknown-draft", draftId);
    }
    if (draft.submittedCandidateId !== null) {
      throw new MarketplaceSubmissionError(
        `draft ${draftId} was already submitted as ${draft.submittedCandidateId} — a changed pipeline files a NEW candidate`,
        "draft-already-submitted",
        draftId,
      );
    }
    const submittedAt = this.deps.clock.now();
    const candidate: TransformReleaseCandidate = {
      candidateId: `cand:${fnv1aHex(stableStringify({ draftId, pipelineId: draft.pipelineId, version: draft.version, at: submittedAt }))}`,
      pipelineId: draft.pipelineId,
      version: draft.version,
      manifestDigest: draft.manifestDigest,
      contentHashes: [...draft.contentHashes],
      attestations: [...draft.attestations],
      submittedAt,
      submittedBy: draft.createdBy,
    };
    const candidateDigest = computeCandidateDigest(this.deps.hash, candidate);
    const materialChange = this.materialChangeFor(candidate);
    const submission: TransformSubmissionRecord = {
      candidate,
      candidateDigest,
      state: "SUBMITTED",
      checkReport: null,
      decisions: [],
      materialChange,
    };
    this.submissions.set(candidate.candidateId, submission);
    this.submissionsByDigest.set(candidateDigest, submission);
    draft.submittedCandidateId = candidate.candidateId;
    return submission;
  }

  /** Run the declared automated checks (SUBMITTED -> AUTOMATED_CHECKS). */
  runAutomatedChecks(candidateId: SportaId): TransformAutomatedCheckReport {
    const submission = this.requireSubmission(candidateId);
    this.transition(submission, "AUTOMATED_CHECKS");
    const manifest = this.deps.manifests.readManifest({
      pipelineId: submission.candidate.pipelineId,
      version: submission.candidate.version,
      manifestDigest: submission.candidate.manifestDigest,
    });
    const report = this.deps.checks.runChecks(submission.candidate, submission.candidateDigest, manifest);
    submission.checkReport = report;
    if (report.clean) {
      this.transition(submission, "HUMAN_REVIEW");
    }
    return report;
  }

  /** Record the durable human review decision (fail-closed gates). */
  recordReviewDecision(input: RecordReviewDecisionInput): TransformReviewDecision {
    const submission = this.requireSubmission(input.candidateId);
    const digest = submission.candidateDigest;

    if (submission.checkReport === null) {
      throw new MarketplaceReviewError(
        "automated checks have not run for this candidate — no decision is possible",
        "checks-not-run",
        digest,
      );
    }
    const validation = validateHumanReview(
      input.humanReview,
      input.outcome === "approved" ? "full" : "partial",
    );
    if (!validation.ok) {
      throw new MarketplaceReviewError(
        `human review signoff rejected: ${validation.detail}`,
        validation.reason,
        digest,
      );
    }
    if (input.outcome === "approved") {
      if (!submission.checkReport.clean) {
        throw new MarketplaceReviewError(
          "automated failures are present — approval is impossible",
          "automated-failures-present",
          digest,
        );
      }
      if (submission.state !== "HUMAN_REVIEW") {
        throw new MarketplaceReviewError(
          `approval requires state HUMAN_REVIEW (current: ${submission.state})`,
          "illegal-outcome-for-state",
          digest,
        );
      }
      if (input.policyVersion.trim().length === 0) {
        throw new MarketplaceReviewError(
          "approval requires the policy version the decision was rendered under",
          "policy-version-missing",
          digest,
        );
      }
    }

    const targetState = input.outcome === "approved" ? "APPROVED" : input.outcome === "rejected" ? "REJECTED" : "CHANGES_REQUESTED";
    this.transition(submission, targetState);

    const decision = assembleReviewDecision({
      decisionId: `dec:${fnv1aHex(stableStringify({ candidateId: input.candidateId, digest, at: this.deps.clock.now(), seq: submission.decisions.length }))}`,
      candidate: submission.candidate,
      candidateDigest: digest,
      checkReport: submission.checkReport,
      humanReview: validation.reviews,
      outcome: input.outcome,
      policyVersion: input.policyVersion,
      rationale: input.rationale,
      evidenceRefs: input.evidenceRefs,
      decidedAt: this.deps.clock.now(),
    });
    submission.decisions = [...submission.decisions, decision];
    return decision;
  }

  /** Read a submission by candidate id (fixture-grade ledger). */
  readSubmission(candidateId: SportaId): TransformSubmissionRecord | null {
    return this.submissions.get(candidateId) ?? null;
  }

  /** Read a submission by frozen digest (the listing-service seam). */
  readSubmissionByDigest(digest: ContentHash): TransformSubmissionRecord | null {
    return this.submissionsByDigest.get(digest) ?? null;
  }

  /** The approved decision for an exact digest, if any (verification seam). */
  approvedDecisionFor(digest: ContentHash): TransformReviewDecision | null {
    const submission = this.submissionsByDigest.get(digest);
    if (submission === undefined) return null;
    return submission.decisions.find((decision) => decision.outcome === "approved") ?? null;
  }

  /** Mark a submission PUBLISHED (called by the listing service). */
  markPublished(digest: ContentHash): void {
    const submission = this.submissionsByDigest.get(digest);
    if (submission === undefined) {
      throw new MarketplaceSubmissionError(
        `no frozen submission for digest ${digest} — cannot publish`,
        "unknown-candidate",
      );
    }
    this.transition(submission, "PUBLISHED");
  }

  /** Typed state transition with the explicit table (no silent moves). */
  private transition(submission: TransformSubmissionRecord, to: TransformSubmissionRecord["state"]): void {
    if (!candidateCanTransition(submission.state, to)) {
      throw new MarketplaceSubmissionError(
        `candidate ${submission.candidate.candidateId} cannot move ${submission.state} -> ${to}`,
        "state-transition-illegal",
        submission.candidate.candidateId,
      );
    }
    submission.state = to;
  }

  private requireSubmission(candidateId: SportaId): TransformSubmissionRecord {
    const submission = this.submissions.get(candidateId);
    if (submission === undefined) {
      throw new MarketplaceSubmissionError(`candidate ${candidateId} not found`, "unknown-candidate", candidateId);
    }
    return submission;
  }

  /** Materiality vs the latest approved candidate for the pipeline. */
  private materialChangeFor(next: TransformReleaseCandidate): TransformMaterialChangeReport | null {
    let previous: TransformSubmissionRecord | null = null;
    for (const submission of this.submissions.values()) {
      if (
        submission.candidate.pipelineId === next.pipelineId &&
        submission.decisions.some((decision) => decision.outcome === "approved") &&
        (previous === null || submission.candidate.submittedAt > previous.candidate.submittedAt)
      ) {
        previous = submission;
      }
    }
    if (previous === null) return null;
    return detectMaterialChange(previous.candidate, next, {
      previous: this.deps.manifests.readManifest({
        pipelineId: previous.candidate.pipelineId,
        version: previous.candidate.version,
        manifestDigest: previous.candidate.manifestDigest,
      }),
      next: this.deps.manifests.readManifest({
        pipelineId: next.pipelineId,
        version: next.version,
        manifestDigest: next.manifestDigest,
      }),
    });
  }
}
