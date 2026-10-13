/**
 * W9B-2 — the listing service (app layer). Owns approved immutable
 * releases, version history, suspension/withdrawal/supersession.
 * `publishReviewedRelease` is the ONLY path from a decision to a
 * listing: it verifies the decision against the publication
 * service's durable records (exact frozen digest, matching approved
 * decisionId, state APPROVED). P9-09: version history accumulates —
 * v1 stays listed and reproducible when v2 publishes; an unreviewed
 * update is refused (typed error) and therefore never selectable.
 * P9-10: suspension/withdrawal/supersession block new selection
 * while preserving every historical record. Fixture-grade in-memory
 * ledgers, honestly labeled.
 */
import type { Iso8601, SportaId } from "@sporta/contracts/contract";
import type { PolicySet } from "@sporta/contracts/contract";
import { listingCanTransition } from "../domain/lifecycle.js";
import { MarketplaceListingError } from "../domain/errors.js";
import type { MarketplaceClock } from "../domain/ports.js";
import { fnv1aHex, stableStringify } from "../domain/stable.js";
import type {
  TransformListing,
  TransformListingState,
  TransformOfferTerms,
  TransformReviewDecision,
  TransformSuspensionRecord,
} from "@sporta/marketplace/contract";
import type { PublicationService } from "./publicationService.js";

/** Additive typed record of one listing-level state action. */
export interface TransformListingActionRecord {
  actionId: SportaId;
  listingId: SportaId;
  action: "suspend" | "withdraw" | "supersede";
  reason: string;
  actor: string;
  actedAt: Iso8601;
}

/** The listing fields a publisher supplies at publication time. */
export interface TransformListingInput {
  title: string;
  description: string;
  category: string;
  supportedFeedTypes: readonly string[];
  expectedOutputs: readonly string[];
  limitations: readonly string[];
  publisher: string;
  compatibility: readonly string[];
  support: string;
  offer: TransformOfferTerms;
  expectations: TransformListing["expectations"];
  rightsPrerequisites: readonly string[];
  policy: PolicySet;
  changelog: string;
}

/** Constructor dependencies. */
export interface ListingServiceDeps {
  clock: MarketplaceClock;
  publications: PublicationService;
}

/** Listing publication and state-change owner. */
export class ListingService {
  private readonly deps: ListingServiceDeps;
  private readonly listings = new Map<SportaId, TransformListing>();
  private readonly listingsByPipeline = new Map<SportaId, TransformListing>();
  private readonly suspensions = new Map<SportaId, TransformSuspensionRecord[]>();
  private readonly actions = new Map<SportaId, TransformListingActionRecord[]>();

  constructor(deps: ListingServiceDeps) {
    this.deps = deps;
  }

  /**
   * Publish an approved decision as the listing's current release.
   * Verifies the decision against the durable submission record —
   * fabricated or stale decisions are typed errors, never listings.
   */
  publishReviewedRelease(decision: TransformReviewDecision, input: TransformListingInput): TransformListing {
    if (decision.outcome !== "approved") {
      throw new MarketplaceListingError(
        `decision ${decision.decisionId} outcome is "${decision.outcome}" — only approval publishes`,
        "decision-not-approved",
      );
    }
    const submission = this.deps.publications.readSubmissionByDigest(decision.candidateDigest);
    if (submission === null) {
      throw new MarketplaceListingError(
        `no frozen submission for digest ${decision.candidateDigest} — the decision certifies nothing`,
        "unknown-decision",
      );
    }
    const stored = submission.decisions.find((candidate) => candidate.decisionId === decision.decisionId);
    if (stored === undefined || stored.outcome !== "approved") {
      throw new MarketplaceListingError(
        `decision ${decision.decisionId} does not match a durable approved decision for ${decision.candidateDigest}`,
        "decision-not-approved",
      );
    }

    const existing = this.listingsByPipeline.get(submission.candidate.pipelineId);
    if (existing !== undefined) {
      if (existing.status !== "PUBLISHED") {
        throw new MarketplaceListingError(
          `listing ${existing.listingId} is ${existing.status} — terminal listings do not resurrect`,
          "listing-state-terminal",
          existing.listingId,
        );
      }
      // Version-immutability checks come BEFORE the candidate-state
      // check so an already-published release reports the precise
      // duplicate/conflict kind (P9-09).
      const priorSameVersion = existing.versionHistory.find(
        (entry) => entry.version === submission.candidate.version,
      );
      if (priorSameVersion !== undefined) {
        if (priorSameVersion.releaseDigest === decision.candidateDigest) {
          throw new MarketplaceListingError(
            `release ${decision.candidateDigest} (${submission.candidate.version}) is already published`,
            "duplicate-release",
            existing.listingId,
          );
        }
        throw new MarketplaceListingError(
          `version ${submission.candidate.version} is already published with a different digest — versions are immutable`,
          "version-conflict",
          existing.listingId,
        );
      }
    }
    if (submission.state !== "APPROVED") {
      throw new MarketplaceListingError(
        `candidate for digest ${decision.candidateDigest} is in state ${submission.state} — only APPROVED publishes`,
        "candidate-not-approved",
      );
    }
    this.deps.publications.markPublished(decision.candidateDigest);

    if (existing === undefined) {
      const listingId = `list:${fnv1aHex(stableStringify({ pipelineId: submission.candidate.pipelineId, at: this.deps.clock.now() }))}`;
      const listing: TransformListing = {
        listingId,
        pipelineId: submission.candidate.pipelineId,
        currentRelease: {
          version: submission.candidate.version,
          releaseDigest: decision.candidateDigest,
          reviewedAt: decision.decidedAt,
        },
        title: input.title,
        description: input.description,
        category: input.category,
        supportedFeedTypes: [...input.supportedFeedTypes],
        expectedOutputs: [...input.expectedOutputs],
        limitations: [...input.limitations],
        publisher: input.publisher,
        status: "PUBLISHED",
        versionHistory: [
          {
            version: submission.candidate.version,
            releaseDigest: decision.candidateDigest,
            changelog: input.changelog,
          },
        ],
        offer: input.offer,
        compatibility: [...input.compatibility],
        support: input.support,
        expectations: input.expectations,
        rightsPrerequisites: [...input.rightsPrerequisites],
        policy: input.policy,
      };
      this.listings.set(listingId, listing);
      this.listingsByPipeline.set(listing.pipelineId, listing);
      return listing;
    }

    // P9-09: v1 stays listed and reproducible; history only APPENDS.
    existing.versionHistory = [
      ...existing.versionHistory,
      {
        version: submission.candidate.version,
        releaseDigest: decision.candidateDigest,
        changelog: input.changelog,
      },
    ];
    existing.currentRelease = {
      version: submission.candidate.version,
      releaseDigest: decision.candidateDigest,
      reviewedAt: decision.decidedAt,
    };
    existing.offer = input.offer;
    existing.title = input.title;
    existing.description = input.description;
    return existing;
  }

  /** Suspend: block new runs, preserve history (frozen record, P9-10). */
  suspendListing(
    listingId: SportaId,
    input: { reason: string; suspendedBy: string },
  ): { suspension: TransformSuspensionRecord; listing: TransformListing } {
    const listing = this.requirePublished(listingId);
    const suspension: TransformSuspensionRecord = {
      suspensionId: `susp:${fnv1aHex(stableStringify({ listingId, at: this.deps.clock.now(), seq: (this.suspensions.get(listingId) ?? []).length }))}`,
      listingId,
      pipelineId: listing.pipelineId,
      version: listing.currentRelease.version,
      reason: input.reason,
      suspendedAt: this.deps.clock.now(),
      suspendedBy: input.suspendedBy,
      effect: "block-new-runs",
    };
    this.recordAction(listingId, "suspend", input.reason, input.suspendedBy);
    this.setStatus(listing, "SUSPENDED");
    this.suspensions.set(listingId, [...(this.suspensions.get(listingId) ?? []), suspension]);
    return { suspension, listing };
  }

  /** Withdraw: publisher removes the listing from public selection. */
  withdrawListing(listingId: SportaId, input: { reason: string; withdrawnBy: string }): TransformListing {
    const listing = this.requirePublished(listingId);
    this.recordAction(listingId, "withdraw", input.reason, input.withdrawnBy);
    this.setStatus(listing, "WITHDRAWN");
    return listing;
  }

  /** Supersede: replaced by another listing; history preserved. */
  supersedeListing(
    listingId: SportaId,
    input: { supersededBy: SportaId; reason: string; actor: string },
  ): TransformListing {
    const listing = this.requirePublished(listingId);
    this.recordAction(listingId, "supersede", `${input.reason} (superseded by ${input.supersededBy})`, input.actor);
    this.setStatus(listing, "SUPERSEDED");
    return listing;
  }

  /** Read one listing (history preserved after every state change). */
  readListing(listingId: SportaId): TransformListing | null {
    return this.listings.get(listingId) ?? null;
  }

  /** The live suspension record for a listing, if suspended. */
  activeSuspension(listingId: SportaId): TransformSuspensionRecord | null {
    if (this.listings.get(listingId)?.status !== "SUSPENDED") return null;
    const records = this.suspensions.get(listingId) ?? [];
    return records[records.length - 1] ?? null;
  }

  /** All suspension records (audit trail, never falsified). */
  readSuspensions(listingId: SportaId): readonly TransformSuspensionRecord[] {
    return [...(this.suspensions.get(listingId) ?? [])];
  }

  /** All listing actions (audit trail). */
  readListingActions(listingId: SportaId): readonly TransformListingActionRecord[] {
    return [...(this.actions.get(listingId) ?? [])];
  }

  private requirePublished(listingId: SportaId): TransformListing {
    const listing = this.listings.get(listingId);
    if (listing === undefined) {
      throw new MarketplaceListingError(`listing ${listingId} not found`, "unknown-listing", listingId);
    }
    if (listing.status !== "PUBLISHED") {
      throw new MarketplaceListingError(
        `listing ${listingId} is ${listing.status} — only PUBLISHED listings change state`,
        "listing-state-terminal",
        listingId,
      );
    }
    return listing;
  }

  private setStatus(listing: TransformListing, to: TransformListingState): void {
    if (!listingCanTransition(listing.status, to)) {
      throw new MarketplaceListingError(
        `listing ${listing.listingId} cannot move ${listing.status} -> ${to}`,
        "listing-state-terminal",
        listing.listingId,
      );
    }
    listing.status = to;
  }

  private recordAction(
    listingId: SportaId,
    action: TransformListingActionRecord["action"],
    reason: string,
    actor: string,
  ): void {
    this.actions.set(listingId, [
      ...(this.actions.get(listingId) ?? []),
      {
        actionId: `act:${fnv1aHex(stableStringify({ listingId, action, at: this.deps.clock.now(), seq: (this.actions.get(listingId) ?? []).length }))}`,
        listingId,
        action,
        reason,
        actor,
        actedAt: this.deps.clock.now(),
      },
    ]);
  }
}
