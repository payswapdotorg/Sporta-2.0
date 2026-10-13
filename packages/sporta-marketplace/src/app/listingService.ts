/**
 * W9B-2 — the listing service (app layer, P9-09/10). Approved releases
 * become `TransformListing`s; versions are immutable and append-only;
 * suspension/withdrawal/supersession block new selection while history
 * stays intact. `currentRelease.releaseDigest` is pinned to the EXACT
 * approving decision's candidate digest (byte-equality asserted — a
 * mismatch is a typed error, never a silent re-pin), and listing policy
 * and expectations project from the reviewed manifest (PolicySet
 * propagation).
 */
import type {
  ContentHash,
  SportaId,
  TransformListing,
  TransformOfferTerms,
  TransformReviewDecision,
  TransformSuspensionRecord,
} from "@sporta/marketplace/contract";
import type {
  CandidateStorePort,
  DecisionStorePort,
  ListingStateEventStorePort,
  ListingStorePort,
  MarketplaceClock,
  MarketplaceHashPort,
  SuspensionStorePort,
  TransformListingStateEvent,
  TransformManifestReadPort,
} from "../domain/ports.js";
import {
  TransformListingError,
  TransformManifestUnresolvedError,
  TransformReleaseDigestMismatchError,
  TransformUnknownRecordError,
  TransformVersionRegressionError,
} from "../domain/errors.js";
import {
  advanceCandidate,
  advanceListing,
  compareVersions,
  type TransformCandidateRecord,
} from "../domain/lifecycle.js";
import { idFromDigest } from "../domain/stable.js";

/** Constructor dependencies — every IO seam injected. */
export interface ListingServiceDeps {
  clock: MarketplaceClock;
  hash: MarketplaceHashPort;
  candidates: CandidateStorePort;
  decisions: DecisionStorePort;
  listings: ListingStorePort;
  suspensions: SuspensionStorePort;
  events: ListingStateEventStorePort;
  manifests: TransformManifestReadPort;
}

/** The product-facing listing fields supplied at publish time. */
export interface PublishApprovedReleaseInput {
  candidateId: SportaId;
  /** Defaults to the latest approving decision for the candidate digest. */
  decisionId?: SportaId;
  title: string;
  description: string;
  category: string;
  supportedFeedTypes: readonly string[];
  expectedOutputs: readonly string[];
  limitations: readonly string[];
  compatibility: readonly string[];
  support: string;
  offer: TransformOfferTerms;
  rightsPrerequisites: readonly string[];
  changelog: string;
}

export class ListingService {
  private readonly deps: ListingServiceDeps;

  constructor(deps: ListingServiceDeps) {
    this.deps = deps;
  }

  /**
   * Publish an APPROVED candidate as the listing's current release.
   * First publish creates the listing; later versions append immutable
   * history entries and move currentRelease (v1 stays listed and
   * reproducible). Idempotent for an already-published exact release.
   */
  publishApprovedRelease(input: PublishApprovedReleaseInput): TransformListing {
    const candidate = this.requireCandidate(input.candidateId);
    if (candidate.candidateDigest === null) {
      throw new TransformListingError(
        `candidate ${input.candidateId} is a DRAFT — drafts are private and never publishable (P9-07)`,
        "candidate-not-approved",
      );
    }

    const existing = this.deps.listings.byPipeline(candidate.pipelineId);
    if (candidate.lifecycle === "PUBLISHED") {
      if (
        existing !== null &&
        existing.currentRelease.releaseDigest === candidate.candidateDigest
      ) {
        return existing;
      }
      throw new TransformListingError(
        `candidate ${input.candidateId} is already PUBLISHED as another listing state — only APPROVED candidates publish new releases`,
        "candidate-not-approved",
      );
    }
    if (candidate.lifecycle !== "APPROVED") {
      throw new TransformListingError(
        `candidate ${input.candidateId} is ${candidate.lifecycle} — approval is the only path to a listing (P9-08)`,
        "candidate-not-approved",
      );
    }

    const decision = this.requireApprovingDecision(
      candidate.candidateId,
      candidate.candidateDigest,
      input.decisionId ?? null,
    );
    if (decision.candidateDigest !== candidate.candidateDigest) {
      throw new TransformReleaseDigestMismatchError(
        `approving decision ${decision.decisionId} certifies ${decision.candidateDigest} but candidate ${candidate.candidateId} froze ${candidate.candidateDigest}`,
        decision.decisionId,
        candidate.candidateDigest,
        decision.candidateDigest,
      );
    }

    const manifest = this.deps.manifests.read(
      candidate.pipelineId,
      candidate.version,
      candidate.manifestDigest,
    );
    if (manifest === null) {
      throw new TransformManifestUnresolvedError(
        `manifest ${candidate.manifestDigest} for ${candidate.pipelineId}@${candidate.version} unresolvable at publish — listing content must project from reviewed content`,
        candidate.pipelineId,
        candidate.version,
        candidate.manifestDigest,
      );
    }

    const release = {
      version: candidate.version,
      releaseDigest: decision.candidateDigest,
      reviewedAt: decision.decidedAt,
    };
    const versionEntry = {
      version: candidate.version,
      releaseDigest: decision.candidateDigest,
      changelog: input.changelog,
    };

    if (existing === null) {
      const listing: TransformListing = {
        listingId: idFromDigest("list", this.deps.hash.stable([candidate.pipelineId])),
        pipelineId: candidate.pipelineId,
        currentRelease: release,
        title: input.title,
        description: input.description,
        category: input.category,
        supportedFeedTypes: [...input.supportedFeedTypes],
        expectedOutputs: [...input.expectedOutputs],
        limitations: [...input.limitations],
        publisher: candidate.submittedBy,
        status: "PUBLISHED",
        versionHistory: [versionEntry],
        offer: input.offer,
        compatibility: [...input.compatibility],
        support: input.support,
        expectations: manifest.expectations,
        rightsPrerequisites: [...input.rightsPrerequisites],
        policy: manifest.policy,
      };
      this.commitPublish(candidate, listing);
      return listing;
    }

    if (existing.status !== "PUBLISHED") {
      throw new TransformListingError(
        `listing ${existing.listingId} is ${existing.status} — new versions publish only onto PUBLISHED listings in this slice`,
        "listing-not-active",
      );
    }
    const comparison = compareVersions(candidate.version, existing.currentRelease.version);
    if (comparison < 0) {
      throw new TransformVersionRegressionError(
        `version ${candidate.version} is below the current release ${existing.currentRelease.version} of listing ${existing.listingId}`,
        existing.listingId,
        existing.currentRelease.version,
        candidate.version,
      );
    }
    if (comparison === 0) {
      if (existing.currentRelease.releaseDigest === decision.candidateDigest) return existing;
      throw new TransformVersionRegressionError(
        `version ${candidate.version} is already current with a different frozen digest on listing ${existing.listingId}`,
        existing.listingId,
        existing.currentRelease.version,
        candidate.version,
      );
    }

    const updated: TransformListing = {
      ...existing,
      currentRelease: release,
      title: input.title,
      description: input.description,
      category: input.category,
      supportedFeedTypes: [...input.supportedFeedTypes],
      expectedOutputs: [...input.expectedOutputs],
      limitations: [...input.limitations],
      versionHistory: [...existing.versionHistory, versionEntry],
      offer: input.offer,
      compatibility: [...input.compatibility],
      support: input.support,
      rightsPrerequisites: [...input.rightsPrerequisites],
    };
    this.commitPublish(candidate, updated);
    return updated;
  }

  /**
   * Suspend a PUBLISHED listing: writes the frozen
   * `TransformSuspensionRecord` (effect block-new-runs) and moves the
   * listing to SUSPENDED. History is never mutated or dropped.
   */
  suspendListing(
    listingId: SportaId,
    input: { reason: string; version?: string },
    suspendedBy: string,
  ): { listing: TransformListing; suspension: TransformSuspensionRecord } {
    const listing = this.requireListing(listingId);
    advanceListing(listing.status, "SUSPENDED");
    const suspendedAt = this.deps.clock.now();
    const version = input.version ?? listing.currentRelease.version;
    const suspension: TransformSuspensionRecord = {
      suspensionId: idFromDigest(
        "susp",
        this.deps.hash.stable([listing.listingId, version, suspendedAt, input.reason]),
      ),
      listingId: listing.listingId,
      pipelineId: listing.pipelineId,
      version,
      reason: input.reason,
      suspendedAt,
      suspendedBy,
      effect: "block-new-runs",
    };
    const suspended: TransformListing = { ...listing, status: "SUSPENDED" };
    this.deps.listings.save(suspended);
    this.deps.suspensions.append(suspension);
    this.appendEvent(suspended, "suspended", input.reason, suspendedBy, suspendedAt, version);
    return { listing: suspended, suspension };
  }

  /** Withdraw a PUBLISHED listing (terminal in this slice; history kept). */
  withdrawListing(
    listingId: SportaId,
    input: { reason: string },
    withdrawnBy: string,
  ): TransformListing {
    const listing = this.requireListing(listingId);
    advanceListing(listing.status, "WITHDRAWN");
    return this.commitTerminalTransition(listing, "WITHDRAWN", input.reason, withdrawnBy);
  }

  /** Supersede a PUBLISHED listing with a successor (history kept). */
  supersedeListing(
    listingId: SportaId,
    input: { successorListingId: SportaId; reason: string },
    supersededBy: string,
  ): TransformListing {
    const listing = this.requireListing(listingId);
    advanceListing(listing.status, "SUPERSEDED");
    const superseded = this.commitTerminalTransition(
      listing,
      "SUPERSEDED",
      `${input.reason} (successor: ${input.successorListingId})`,
      supersededBy,
    );
    return superseded;
  }

  /** Read a listing (tests/product; honest null handled typed). */
  readListing(listingId: SportaId): TransformListing {
    return this.requireListing(listingId);
  }

  /** Suspension history for a listing (append-only, never dropped). */
  suspensionHistory(listingId: SportaId): readonly TransformSuspensionRecord[] {
    return this.deps.suspensions.byListing(listingId);
  }

  private commitPublish(candidate: TransformCandidateRecord, listing: TransformListing): void {
    advanceCandidate("APPROVED", "PUBLISHED");
    this.deps.candidates.save({ ...candidate, lifecycle: "PUBLISHED" });
    this.deps.listings.save(listing);
  }

  private commitTerminalTransition(
    listing: TransformListing,
    status: "WITHDRAWN" | "SUPERSEDED",
    reason: string,
    actor: string,
  ): TransformListing {
    const at = this.deps.clock.now();
    const transitioned: TransformListing = { ...listing, status };
    this.deps.listings.save(transitioned);
    this.appendEvent(
      transitioned,
      status === "WITHDRAWN" ? "withdrawn" : "superseded",
      reason,
      actor,
      at,
      listing.currentRelease.version,
    );
    return transitioned;
  }

  private appendEvent(
    listing: TransformListing,
    kind: "suspended" | "withdrawn" | "superseded",
    reason: string,
    actor: string,
    at: string,
    version: string,
  ): void {
    const event: TransformListingStateEvent = {
      eventId: idFromDigest("lev", this.deps.hash.stable([listing.listingId, kind, at, reason])),
      listingId: listing.listingId,
      pipelineId: listing.pipelineId,
      kind,
      version,
      reason,
      actor,
      at,
      effect: "block-new-runs",
    };
    this.deps.events.append(event);
  }

  private requireApprovingDecision(
    candidateId: SportaId,
    candidateDigest: ContentHash,
    decisionId: SportaId | null,
  ): TransformReviewDecision {
    if (decisionId !== null) {
      const decision = this.deps.decisions.byId(decisionId);
      if (decision === null) {
        throw new TransformUnknownRecordError(
          `no review decision ${decisionId}`,
          "decision",
          decisionId,
        );
      }
      if (decision.outcome !== "approved") {
        throw new TransformListingError(
          `decision ${decisionId} outcome is "${decision.outcome}" — only approvals publish (P9-08/10)`,
          "decision-not-approval",
        );
      }
      return decision;
    }
    const decisions = this.deps.decisions.byCandidate(candidateDigest);
    const approved = decisions.filter((decision) => decision.outcome === "approved");
    const latest = approved[approved.length - 1];
    if (latest === undefined) {
      throw new TransformListingError(
        `no approving decision on record for candidate ${candidateId} — approval is the only path to a listing`,
        "approving-decision-missing",
      );
    }
    return latest;
  }

  private requireListing(listingId: SportaId): TransformListing {
    const listing = this.deps.listings.byId(listingId);
    if (listing === null) {
      throw new TransformUnknownRecordError(`no listing ${listingId}`, "listing", listingId);
    }
    return listing;
  }

  private requireCandidate(candidateId: SportaId) {
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
