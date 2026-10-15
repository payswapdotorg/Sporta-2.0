/**
 * W12B-1 + W12B-2 — the my-pipelines screen REAL host (composition-grade).
 * EVIDENCE CLASS: REAL, labeled at the point of use. A pure projection
 * over the REAL marketplace services:
 *
 *   - creator records over the W12-03 freeze query service
 *     (`CreatorCandidateQueryService` — `listByCreator` / `listAll` over
 *     the in-memory candidate store's additive enumeration read; the
 *     frozen `CandidateStorePort` untouched);
 *   - review decisions over the frozen review seam (the durable
 *     decision store's `byCandidate(digest)` read — the SAME seam the
 *     studio composition's `readReviewStatus` rides, and the authority
 *     the frozen port comment names for version-status reads).
 *
 * The `origin: "fixture-demo"` demo rows of the browser fixture host
 * retire on this side: EVERY row here is a REAL `TransformCandidateRecord`
 * with `origin: "record"`; `creatorState` is a pure, total, explicit
 * projection of the REAL lifecycle (DRAFT→SUBMITTED→…), never guessed.
 * The labeled fixture host itself STAYS for the browser demo (sibling,
 * not replacement — the w12a law).
 *
 * State-owner law (ADR-w12): this host owns NO store, NO ledger, NO
 * second state. The query service + the decision seam ARE the single
 * read authorities; this adapter is a structural projection over their
 * records (the frozen mirror shapes in `marketplaceScreenPorts.ts`).
 *
 * Write law (the frozen port): `MyPipelinesScreenPort` exposes NO write
 * methods at this SHA — DRAFT/SUBMITTED writes are not on any read
 * model. The immutability laws surface through the REAL services'
 * typed errors (asserted verbatim in the battery) and the per-record
 * note; the screen's disabled actions carry their own typed reasons.
 * Never a silent no-op, never a stringly null.
 *
 * Acceptance: W12-10 (REAL records, origin "record", pure lifecycle
 * projection, zero fixture-demo rows), W12-11 (the changed-resubmit
 * typed error + the already-submitted refusal preserved verbatim),
 * W12-12 (version-status reads: real decisions or the honest
 * `no review decision recorded` refusal — both arms).
 */
import type {
  ContentHash,
  CreatorCandidateQueryService,
  TransformCandidateLifecycleState,
  TransformCandidateRecord,
  TransformReviewDecision,
} from "@sporta/marketplace/contract";
import type {
  CreatorPipelineRecord,
  MarketplaceReviewShape,
  MyPipelinesScreenPort,
  ScreenRefusal,
} from "./marketplaceScreenPorts.js";

/**
 * The READ-ONLY structural slice of the frozen review seam this host
 * rides: the durable review decisions for one candidate digest. The
 * frozen `DecisionStorePort` (and its REAL in-memory implementation)
 * satisfies this structurally — the `MarketplaceStudioReadShape`
 * precedent: a structural mirror of the read surface, no cross-lane
 * import, no write surface exposed to the screen adapter.
 *
 * Why not `ReviewService`: its only read (`latestApprovalForDigest`)
 * returns APPROVALS ONLY — a changes-requested or rejected decision is
 * a REAL review decision and must project through a version-status
 * read, never be misreported as "no review decision recorded" (the
 * honesty law). Recorded in the worker report's DEVIATIONS.
 */
export interface CreatorReviewDecisionRead {
  /** Every durable review decision recorded for one frozen candidate digest (append order). */
  byCandidate(candidateDigest: ContentHash): readonly TransformReviewDecision[];
}

/**
 * The REAL my-pipelines host. Extends the frozen `MyPipelinesScreenPort`
 * with one additive field — `gradeNote` — so the TL composition root can
 * surface the honest store grade to the screen (the w12a precedent).
 * The screen that consumes only `MyPipelinesScreenPort` keeps compiling;
 * the composition root reads the additive field for the badge.
 */
export interface MyPipelinesRealHost extends MyPipelinesScreenPort {
  /**
   * Honest grade note carried to the screen surface. Verbatim:
   * `"BACKING: REAL (candidate + decision stores: fixture-grade
   * in-memory)"` — both stores this host reads are fixture-grade
   * in-memory (the W9B adapters' honest label); the host is REAL
   * because it projects over the REAL services and their REAL
   * lifecycle state machines. Never re-badged as `production`.
   */
  readonly gradeNote: string;
}

/** Constructor dependencies (the REAL read services; no store owned here). */
export interface CreateMyPipelinesRealHostDeps {
  /** The W12-03 freeze query service — the creator-side enumeration read. */
  readonly query: CreatorCandidateQueryService;
  /** The frozen review seam's decision read (see `CreatorReviewDecisionRead`). */
  readonly review: CreatorReviewDecisionRead;
}

/**
 * The honesty label for the stores behind this host — the candidate
 * store (the W12-03 enumeration) and the decision store (the review
 * seam) are both fixture-grade in-memory (the W9B adapters' label).
 * The host is REAL (it projects over the REAL services); the store
 * honesty label carries, never re-badged (the W12-07 law generalized).
 */
export const MY_PIPELINES_STORE_GRADE_NOTE =
  "BACKING: REAL (candidate + decision stores: fixture-grade in-memory)";

/**
 * Create the REAL my-pipelines host over the freeze query service + the
 * frozen review seam. A pure projection: service records in, frozen
 * screen-port shapes out. Typed errors propagate verbatim — never
 * swallowed, never stringly.
 *
 * The returned object satisfies `MyPipelinesScreenPort` (compile-time
 * proof against the frozen port) AND exposes the additive `gradeNote`
 * for composition-grade wiring (the TL's productComposition.ts reads it
 * for the screen's evidence badge).
 */
export function createMyPipelinesRealHost(
  deps: CreateMyPipelinesRealHostDeps,
): MyPipelinesRealHost {
  const { query, review } = deps;
  return {
    backing: "real",
    gradeNote: MY_PIPELINES_STORE_GRADE_NOTE,
    async listCreatorRecords(creator: string): Promise<readonly CreatorPipelineRecord[]> {
      // The W12-03 freeze read: the query service's creator-scoped
      // enumeration (listAll + the submittedBy filter — the creator's
      // own view: drafts included, other creators excluded, insertion
      // order preserved). The host adds NO record, invents NO state.
      return query.listByCreator(creator).map((record) =>
        projectCandidateRecord(record, review),
      );
    },
    async readCreatorVersionStatus(
      pipelineId: string,
      version: string,
    ): Promise<MarketplaceReviewShape | ScreenRefusal> {
      return readVersionStatus(query, review, pipelineId, version);
    },
  };
}

/**
 * The version-status read over the REAL seams (W12B-2). The candidate
 * for (pipelineId, version) comes from the freeze enumeration read; the
 * decision comes from the review seam (the LATEST decision for the
 * frozen digest — approved, changes-requested and rejected are ALL real
 * decisions). Every absence is the honest typed refusal carrying the
 * exact `no review decision recorded` law — never a fabricated
 * decision, never a stringly null.
 */
function readVersionStatus(
  query: CreatorCandidateQueryService,
  review: CreatorReviewDecisionRead,
  pipelineId: string,
  version: string,
): MarketplaceReviewShape | ScreenRefusal {
  const candidate =
    query
      .listAll()
      .find((record) => record.pipelineId === pipelineId && record.version === version) ??
    null;
  if (candidate === null) {
    return {
      reason: `no review decision recorded for ${pipelineId} v${version} in the marketplace read model — no candidate record exists for this pipeline and version (honest absence, never a fabricated decision)`,
    };
  }
  if (candidate.candidateDigest === null) {
    return {
      reason: `no review decision recorded for ${pipelineId} v${version} in the marketplace read model — the candidate is a DRAFT (private, no frozen digest; nothing has been submitted for review)`,
    };
  }
  const decisions = review.byCandidate(candidate.candidateDigest);
  const latest = decisions.length > 0 ? (decisions[decisions.length - 1] ?? null) : null;
  if (latest === null) {
    return {
      reason: `no review decision recorded for ${pipelineId} v${version} in the marketplace read model — the candidate is ${candidate.lifecycle} and review has not rendered a decision yet`,
    };
  }
  return projectReviewDecision(latest);
}

/**
 * Project one REAL `TransformCandidateRecord` into the frozen
 * `CreatorPipelineRecord` mirror. Every field the record carries
 * projects verbatim; the fields the candidate store does NOT carry
 * (listing id, marketing title) stay honest gaps — surfaced in the
 * note, never fabricated.
 */
function projectCandidateRecord(
  record: TransformCandidateRecord,
  review: CreatorReviewDecisionRead,
): CreatorPipelineRecord {
  const latestDecision =
    record.candidateDigest === null ? null : latestDecisionFor(review, record.candidateDigest);
  return {
    // HONEST GAP: the candidate store carries no listing id — the
    // listing read is not on this host's seam (the public-listings
    // authority is the untouched createMarketplaceScreenHost).
    listingId: null,
    pipelineId: record.pipelineId,
    // HONEST DERIVATION: the candidate store carries no marketing
    // title — the candidate identity is the honest title (labeled in
    // the note; never an invented product name).
    title: `${record.pipelineId} v${record.version}`,
    publisher: record.submittedBy,
    // The REAL lifecycle state, VERBATIM (DRAFT, SUBMITTED,
    // AUTOMATED_CHECKS, HUMAN_REVIEW, APPROVED, PUBLISHED,
    // CHANGES_REQUESTED, REJECTED).
    status: record.lifecycle,
    creatorState: creatorStateForLifecycle(record.lifecycle),
    origin: "record",
    approvedVersion: record.candidateDigest === null ? null : record.version,
    reviewedAt: latestDecision === null ? null : latestDecision.decidedAt,
    note: candidateNote(record, latestDecision),
  };
}

/**
 * The creator's viewpoint classification — a PURE, TOTAL, EXPLICIT
 * projection of the REAL candidate lifecycle (never guessed, never the
 * frozen view default). The exact phase always carries in `status`
 * verbatim; this classification is the screen's grouping bucket:
 *
 *   DRAFT                          -> draft
 *   SUBMITTED / AUTOMATED_CHECKS /
 *   HUMAN_REVIEW                   -> submitted   (review in progress)
 *   APPROVED / PUBLISHED           -> released    (the release decision
 *                                                 exists; publication
 *                                                 is the follow-through)
 *   CHANGES_REQUESTED / REJECTED   -> changes-requested (the negative
 *                                                 review-outcome bucket;
 *                                                 REJECTED's terminal
 *                                                 nature carries in
 *                                                 status + note — the
 *                                                 frozen creatorState
 *                                                 vocabulary has no
 *                                                 rejected bucket)
 */
function creatorStateForLifecycle(
  lifecycle: TransformCandidateLifecycleState,
): CreatorPipelineRecord["creatorState"] {
  switch (lifecycle) {
    case "DRAFT":
      return "draft";
    case "SUBMITTED":
    case "AUTOMATED_CHECKS":
    case "HUMAN_REVIEW":
      return "submitted";
    case "APPROVED":
    case "PUBLISHED":
      return "released";
    case "CHANGES_REQUESTED":
    case "REJECTED":
      return "changes-requested";
  }
}

/** The latest decision for a frozen digest, or null when none is on record. */
function latestDecisionFor(
  review: CreatorReviewDecisionRead,
  candidateDigest: ContentHash,
): TransformReviewDecision | null {
  const decisions = review.byCandidate(candidateDigest);
  return decisions.length > 0 ? (decisions[decisions.length - 1] ?? null) : null;
}

/** The shared honest-gap clause (surfaced on every row, never hidden). */
const CANDIDATE_GAP_NOTE =
  "the candidate store carries no marketing title or listing id — title is the candidate identity and the listing read rides the studio seam (honest gap, never fabricated)";

/** The per-lifecycle law note (the write/immutability laws, surfaced). */
function candidateNote(
  record: TransformCandidateRecord,
  latestDecision: TransformReviewDecision | null,
): string {
  const lifecycleNote = lifecycleNoteFor(record, latestDecision);
  return `${lifecycleNote} · ${CANDIDATE_GAP_NOTE}`;
}

function lifecycleNoteFor(
  record: TransformCandidateRecord,
  latestDecision: TransformReviewDecision | null,
): string {
  switch (record.lifecycle) {
    case "DRAFT":
      return "private draft — the candidate digest freezes at submission (P9-07); no listing exists for a draft";
    case "SUBMITTED":
      return "submitted for review — the digest is frozen and the record immutable; a changed candidate requires a NEW version and separate review (P9-09)";
    case "AUTOMATED_CHECKS":
      return "automated check lane running — the exact phase carries in the record status verbatim";
    case "HUMAN_REVIEW":
      return "human review in progress — the exact phase carries in the record status verbatim";
    case "APPROVED":
      return "review approved — the listing publish step follows (the candidate store carries no listing id yet)";
    case "PUBLISHED":
      return "published — the listing record rides the studio composition's listing seam (this host's listingId gap is honest)";
    case "CHANGES_REQUESTED":
      return `changes requested${decisionStamp(latestDecision)} — a changed candidate requires a NEW version and separate review (P9-09)`;
    case "REJECTED":
      return `review rejected this candidate (terminal)${decisionStamp(latestDecision)} — the frozen creatorState vocabulary has no rejected bucket; the record status carries REJECTED verbatim`;
  }
}

/** The decision's decidedAt, when one is on record (for the note lines). */
function decisionStamp(latestDecision: TransformReviewDecision | null): string {
  return latestDecision === null ? "" : ` at ${latestDecision.decidedAt}`;
}

/**
 * Project one REAL `TransformReviewDecision` into the frozen
 * `MarketplaceReviewShape` mirror. Every field carries verbatim; the
 * reviewer roles are the humanReview roles (sorted — the studio
 * projection precedent, `projectReviewStatus`); the automated checks
 * carry their checkId/outcome/evidenceKind verbatim (the lane's own
 * evidence grades — never re-badged).
 */
function projectReviewDecision(decision: TransformReviewDecision): MarketplaceReviewShape {
  return {
    outcome: decision.outcome,
    decidedAt: decision.decidedAt,
    policyVersion: decision.policyVersion,
    rationale: decision.rationale,
    reviewerRoles: decision.humanReview.map((entry) => entry.role).sort(),
    automatedChecks: decision.automatedChecks.map((check) => ({
      checkId: check.checkId,
      outcome: check.outcome,
      evidenceKind: check.evidenceKind,
    })),
  };
}
