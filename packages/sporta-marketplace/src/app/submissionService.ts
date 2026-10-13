/**
 * W9B-1 — the submission service (app layer). Drafts, digest freezing
 * and the automated check lane.
 *
 * DRAFT is private: no listing can exist for it and publication refuses
 * anything not APPROVED. SUBMISSION freezes the candidate digest ONCE
 * (P9-07); afterwards the record is immutable — a behavioral change is
 * a NEW candidate at a NEW version (P9-09). The check lane runs the
 * declared checks over the submitted candidate and refuses advancement
 * on gate failures (fail-closed, P9-08/13).
 *
 * All IO seams are injected (clock, hash, stores, manifest read port,
 * the w9a graph validator); this layer imports no adapter module.
 */
import type {
  ContentHash,
  SportaId,
  TransformReleaseCandidate,
} from "@sporta/marketplace/contract";
import type {
  TransformGraphValidation,
  TransformPipelineManifest,
} from "@sporta/transforms/contract";
import type {
  CandidateStorePort,
  MarketplaceClock,
  MarketplaceHashPort,
  TransformManifestReadPort,
} from "../domain/ports.js";
import type { CheckLaneStorePort } from "../domain/checks.js";
import {
  TransformCandidateImmutableError,
  TransformCheckLaneError,
  TransformLifecycleError,
  TransformUnknownRecordError,
} from "../domain/errors.js";
import {
  advanceCandidate,
  draftCandidateRecord,
  type TransformCandidateRecord,
} from "../domain/lifecycle.js";
import {
  failedGateCheckIds,
  runDeclaredChecks,
  type TransformCheckLaneRecord,
  type TransformDependencySignal,
} from "../domain/checks.js";
import { candidateDigestPreimage, idFromDigest } from "../domain/stable.js";

/** Constructor dependencies — every IO seam injected. */
export interface SubmissionServiceDeps {
  clock: MarketplaceClock;
  hash: MarketplaceHashPort;
  candidates: CandidateStorePort;
  lanes: CheckLaneStorePort;
  manifests: TransformManifestReadPort;
  /** The w9a graph validator, injected by the composition root. */
  validateGraph: (manifest: TransformPipelineManifest) => TransformGraphValidation;
}

/** Draft input — the candidate shape before submission. */
export interface StartDraftInput extends Omit<
  TransformReleaseCandidate,
  "candidateId" | "submittedAt"
> {}

/** Signal sources for one check-lane run (fixture-labeled in tests). */
export interface CheckLaneSignalsInput {
  dependencySignals: Readonly<Record<string, TransformDependencySignal>>;
  similaritySignal: { present: boolean; note: string } | null;
}

export class SubmissionService {
  private readonly deps: SubmissionServiceDeps;

  constructor(deps: SubmissionServiceDeps) {
    this.deps = deps;
  }

  /**
   * Start (or idempotently re-read) a private DRAFT for a
   * (pipeline, version). Replacing a DRAFT with different content is
   * allowed (drafts are private); submitting different content for an
   * already-SUBMITTED version is the typed immutable error.
   */
  startDraft(input: StartDraftInput): TransformCandidateRecord {
    const existing = this.deps.candidates.byPipelineAndVersion(input.pipelineId, input.version);
    if (existing !== null) {
      const sameContent =
        existing.manifestDigest === input.manifestDigest &&
        this.deps.hash.stable([...existing.contentHashes]) ===
          this.deps.hash.stable([...input.contentHashes]) &&
        this.deps.hash.stable([...existing.attestations]) ===
          this.deps.hash.stable([...input.attestations]) &&
        existing.submittedBy === input.submittedBy;
      if (existing.lifecycle === "DRAFT") {
        return sameContent
          ? existing
          : this.saveDraft({
              ...existing,
              ...input,
              lifecycle: "DRAFT",
              candidateDigest: null,
              submittedAt: null,
            });
      }
      if (sameContent) return existing;
      throw new TransformCandidateImmutableError(
        `pipeline ${input.pipelineId} version ${input.version} is already submitted with a frozen digest — a changed candidate requires a NEW version and separate review (P9-09)`,
        existing.candidateId,
        existing.candidateDigest,
      );
    }
    return this.saveDraft(
      draftCandidateRecord(input, this.deriveCandidateId(input), this.deps.clock.now()),
    );
  }

  /**
   * SUBMIT: freeze the candidate digest ONCE and advance DRAFT ->
   * SUBMITTED. The record becomes immutable from here on.
   */
  submitCandidate(candidateId: SportaId): TransformCandidateRecord {
    const record = this.requireCandidate(candidateId);
    if (record.lifecycle !== "DRAFT") {
      throw new TransformLifecycleError(
        `candidate ${candidateId} is already ${record.lifecycle} — submitted candidates are immutable`,
        record.lifecycle,
        "SUBMITTED",
      );
    }
    const digest = this.computeCandidateDigest(record);
    const submitted: TransformCandidateRecord = {
      ...record,
      candidateDigest: digest,
      lifecycle: "SUBMITTED",
      submittedAt: this.deps.clock.now(),
    };
    advanceCandidate("DRAFT", "SUBMITTED");
    this.deps.candidates.save(submitted);
    return submitted;
  }

  /**
   * Run the declared automated checks over the submitted candidate
   * (SUBMITTED -> AUTOMATED_CHECKS; -> HUMAN_REVIEW only when no gate
   * check failed). Gate failures throw the typed lane error and the
   * candidate stays in AUTOMATED_CHECKS with the failed lane on record.
   */
  runAutomatedChecks(
    candidateId: SportaId,
    signals: CheckLaneSignalsInput,
  ): TransformCheckLaneRecord {
    const record = this.requireCandidate(candidateId);
    if (record.lifecycle !== "SUBMITTED" && record.lifecycle !== "AUTOMATED_CHECKS") {
      throw new TransformLifecycleError(
        `automated checks run on SUBMITTED candidates — ${candidateId} is ${record.lifecycle}`,
        record.lifecycle,
        "AUTOMATED_CHECKS",
      );
    }
    if (record.candidateDigest === null) {
      throw new TransformCandidateImmutableError(
        `candidate ${candidateId} has no frozen digest — submit first`,
        candidateId,
        null,
      );
    }
    if (record.lifecycle === "SUBMITTED") advanceCandidate("SUBMITTED", "AUTOMATED_CHECKS");
    const inChecks: TransformCandidateRecord = { ...record, lifecycle: "AUTOMATED_CHECKS" };
    this.deps.candidates.save(inChecks);

    const manifest = this.deps.manifests.read(
      record.pipelineId,
      record.version,
      record.manifestDigest,
    );
    const results = runDeclaredChecks({
      candidate: inChecks as TransformCandidateRecord & { candidateDigest: ContentHash },
      manifest,
      recomputedCandidateDigest: this.computeCandidateDigest(record),
      dependencySignals: signals.dependencySignals,
      similaritySignal: signals.similaritySignal,
      validateGraph: this.deps.validateGraph,
    });

    const lane: TransformCheckLaneRecord = {
      laneId: idFromDigest(
        "lane",
        this.deps.hash.stable([record.candidateId, record.candidateDigest]),
      ),
      candidateId: record.candidateId,
      candidateDigest: record.candidateDigest,
      ranAt: this.deps.clock.now(),
      results,
    };
    this.deps.lanes.append(lane);

    const failed = failedGateCheckIds(results);
    if (failed.length > 0) {
      throw new TransformCheckLaneError(
        `automated gate checks failed for candidate ${candidateId}: ${failed.join(", ")}`,
        failed,
      );
    }
    advanceCandidate("AUTOMATED_CHECKS", "HUMAN_REVIEW");
    const inReview: TransformCandidateRecord = { ...inChecks, lifecycle: "HUMAN_REVIEW" };
    this.deps.candidates.save(inReview);
    return lane;
  }

  /** Read a candidate (honest null handled by the typed error). */
  readCandidate(candidateId: SportaId): TransformCandidateRecord {
    return this.requireCandidate(candidateId);
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

  private deriveCandidateId(input: StartDraftInput): SportaId {
    return idFromDigest("cand", this.deps.hash.stable([input.pipelineId, input.version]));
  }

  private computeCandidateDigest(record: TransformCandidateRecord): ContentHash {
    return this.deps.hash.text(candidateDigestPreimage(record));
  }

  private saveDraft(record: TransformCandidateRecord): TransformCandidateRecord {
    this.deps.candidates.save(record);
    return record;
  }
}
