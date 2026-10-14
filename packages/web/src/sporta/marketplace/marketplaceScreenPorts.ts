/**
 * Marketplace + My-Pipelines screen ports (W11C — the SCREEN-PORTS.md
 * state-owner law).
 *
 * TYPE-ONLY module (the studioPorts.ts precedent): these shapes are what
 * the destination screens consume. They are STRUCTURAL MIRRORS of the
 * frozen marketplace read records (the studio marketplaceViews.ts
 * precedent — "structural mirrors … compat is proven by feeding REAL
 * records through these projectors"), so the adapter over the studio
 * composition's read models satisfies them without this lane importing
 * or editing any Worker-B file. Compat is proven in the node battery by
 * feeding REAL composition records through the adapter.
 *
 * State-owner law: screens read through these ports only. This lane
 * creates NO marketplace store, service or second authority; the port is
 * satisfied by (a) an adapter over the injected studio-composition read
 * shape (REAL records) or (b) the labeled browser fixture host (the
 * studioBrowserFixture.ts precedent).
 */

/** Record-level evidence grade, verbatim from the marketplace seams (UI-15). */
export type MarketplaceRecordGrade = "measured" | "fixture" | "declared";

/** Screen-level backing evidence (the frozen W11 screen vocabulary). */
export type ScreenBacking = "real" | "real-local" | "fixture";

/**
 * Structural mirror of the marketplace listing read shape AS THE STUDIO
 * HOST PORT PROJECTS IT (the W10 read model: approvedVersion +
 * releaseDigest at the top level — the marketplace's raw
 * `currentRelease` is already resolved by the projection).
 */
export interface MarketplaceListingShape {
  listingId: string;
  pipelineId: string;
  title: string;
  description?: string;
  publisher: string;
  status: string;
  approvedVersion: string;
  releaseDigest: string;
  category: string;
  supportedFeedTypes: readonly string[];
  expectedOutputs: readonly string[];
  limitations: readonly string[];
  offer: {
    kind: "free" | "paid-per-run" | "subscription";
    price: { amount: number; currency: string } | null;
    termsLicense?: string;
  };
  compatibility: readonly string[];
  support?: string;
  expectations: {
    typicalLatencyMs: number;
    declaredThroughput: string;
    evidenceGrade: MarketplaceRecordGrade;
  };
  rightsPrerequisites: readonly string[];
  versionHistory: readonly { version: string; releaseDigest: string; changelog: string }[];
}

/** Structural mirror of the review-decision read shape. */
export interface MarketplaceReviewShape {
  outcome: string;
  decidedAt: string;
  policyVersion: string;
  rationale: string;
  reviewerRoles: readonly string[];
  automatedChecks: readonly {
    checkId: string;
    outcome: "pass" | "fail" | "warn";
    evidenceKind: "measured" | "fixture";
  }[];
}

/** Structural mirror of the launch-disclosure read shape (P9-12). */
export interface MarketplaceDisclosureShape {
  listingId: string;
  publisher: string;
  approvedVersion: string;
  releaseDigest: string;
  terms: {
    kind: "free" | "paid-per-run" | "subscription";
    price: { amount: number; currency: string } | null;
    termsLicense: string;
  };
  rightsPrerequisites: readonly string[];
  dependencies: readonly { kind: string; name: string; digest: string; license: string }[];
  outputs: readonly string[];
  limitations: readonly string[];
  cost: { amount: number; currency: string } | null;
  latencyExpectations: {
    typicalLatencyMs: number;
    declaredThroughput: string;
    evidenceGrade: MarketplaceRecordGrade;
  };
  evidenceGrade: MarketplaceRecordGrade;
  reviewedAt: string;
  legalNotice: string;
}

/** Structural mirror of the sample-preview read shape. */
export interface MarketplacePreviewShape {
  pipelineId: string;
  version: string;
  inputSummary: string;
  outputSummary: string;
  semanticEvidence: string;
  evidenceGrade: MarketplaceRecordGrade;
}

/** Everything the marketplace detail view shows for one listing. */
export interface MarketplaceListingDetail {
  listing: MarketplaceListingShape;
  review: MarketplaceReviewShape | null;
  disclosure: MarketplaceDisclosureShape | null;
  preview: MarketplacePreviewShape | null;
}

/**
 * The marketplace screen port (screen id "marketplace" — public
 * listings/details). Reads through the marketplace read models only.
 */
export interface MarketplaceScreenPort {
  /** The backing evidence, surfaced honestly in the screen (UI-15). */
  readonly backing: ScreenBacking;
  /** Public listing summaries (every listing state shown honestly). */
  listPublicListings(): Promise<readonly MarketplaceListingShape[]>;
  /** Full detail for one listing (typed errors propagate verbatim). */
  readListingDetail(listingId: string): Promise<MarketplaceListingDetail>;
}

/**
 * A creator-side record (screen id "my-pipelines" — the SAME marketplace
 * records filtered by creator; SCREEN-PORTS.md). `origin: "record"` rows
 * are real marketplace records; `origin: "fixture-demo"` rows are
 * explicitly labeled fixture demo states (draft/submission states have
 * no read seam at this SHA — surfaced, never disguised).
 */
export interface CreatorPipelineRecord {
  listingId: string | null;
  pipelineId: string;
  title: string;
  publisher: string;
  /** Marketplace lifecycle state carried on the record, verbatim. */
  status: string;
  /** The creator's viewpoint classification (pure projection). */
  creatorState: "released" | "suspended" | "withdrawn" | "superseded" | "draft" | "submitted" | "changes-requested";
  origin: "record" | "fixture-demo";
  approvedVersion: string | null;
  reviewedAt: string | null;
  note: string | null;
}

/** A typed refusal (UI-06 law): never a silent no-op, never a stringly null. */
export interface ScreenRefusal {
  readonly reason: string;
}

/**
 * The my-pipelines port (creator side). Version status reads reuse the
 * marketplace review seam; DRAFT/SUBMITTED writes are not on any read
 * model at this SHA and are surfaced as typed refusals (NEXT
 * DEPENDENCIES), never faked.
 */
export interface MyPipelinesScreenPort {
  readonly backing: ScreenBacking;
  /** Creator records: real records filtered by creator + honest gaps. */
  listCreatorRecords(creator: string): Promise<readonly CreatorPipelineRecord[]>;
  /** Review status for one creator pipeline version (real seam). */
  readCreatorVersionStatus(
    pipelineId: string,
    version: string,
  ): Promise<MarketplaceReviewShape | ScreenRefusal>;
}
