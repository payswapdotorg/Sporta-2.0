/**
 * The marketplace screen host implementations (W11C).
 *
 * (a) `createMarketplaceScreenHost` — the adapter over the studio
 *     composition's read models: the injected shape is a STRUCTURAL
 *     mirror of the `TransformStudioHostPort` read methods this screen
 *     consumes, so the REAL composition satisfies it without this lane
 *     importing any studio/** file (the state-owner law: same records,
 *     zero parallel state, zero cross-lane imports). Reads ride the
 *     REAL marketplace services exactly as the W10A-3 battery proves.
 *
 * (b) `createMarketplaceFixtureHost` — the labeled browser FIXTURE host
 *     (the studioBrowserFixture.ts precedent): static fixture snapshots
 *     + honest fixture creator states, never claimed real.
 *
 * Missing seams (creator DRAFT/SUBMITTED states) surface as typed
 * refusals/notes — never disguised as data (NEXT DEPENDENCIES).
 */
import type {
  CreatorPipelineRecord,
  MarketplaceDisclosureShape,
  MarketplaceListingDetail,
  MarketplaceListingShape,
  MarketplacePreviewShape,
  MarketplaceReviewShape,
  MarketplaceScreenPort,
  MyPipelinesScreenPort,
  ScreenBacking,
  ScreenRefusal,
} from "./marketplaceScreenPorts.js";
import {
  creatorRecordFromListing,
  creatorStateFor,
} from "./marketplaceScreenViews.js";

/**
 * The structural mirror of the studio host's read surface this lane
 * consumes (compat with the REAL `TransformStudioHostPort` is proven by
 * the node battery feeding the REAL composition through the adapter).
 */
export interface MarketplaceStudioReadShape {
  readonly evidence?: "real" | "fixture";
  listListings(): Promise<readonly MarketplaceListingShape[]>;
  readReviewStatus(pipelineId: string, version: string): Promise<MarketplaceReviewShape | null>;
  readLaunchDisclosure(listingId: string): Promise<MarketplaceDisclosureShape>;
  readSamplePreview(pipelineId: string, version: string): Promise<MarketplacePreviewShape | null>;
}

/** Map the studio host's backing evidence onto the screen vocabulary. */
function backingOf(studio: MarketplaceStudioReadShape): ScreenBacking {
  return studio.evidence === "fixture" ? "fixture" : "real";
}

/** Build the REAL-record marketplace + my-pipelines screen hosts. */
export function createMarketplaceScreenHost(
  studio: MarketplaceStudioReadShape,
): { marketplace: MarketplaceScreenPort; myPipelines: MyPipelinesScreenPort } {
  const marketplace: MarketplaceScreenPort = {
    backing: backingOf(studio),
    async listPublicListings(): Promise<readonly MarketplaceListingShape[]> {
      return studio.listListings();
    },
    async readListingDetail(listingId: string): Promise<MarketplaceListingDetail> {
      const listings = await studio.listListings();
      const listing = listings.find((entry) => entry.listingId === listingId);
      if (listing === undefined) {
        // Typed refusal, verbatim from the read model's vocabulary.
        throw new Error(`no listing ${listingId} — the marketplace read model carries no such record`);
      }
      const [review, disclosure, preview] = await Promise.all([
        studio.readReviewStatus(listing.pipelineId, listing.approvedVersion),
        readDisclosureCarefully(studio, listingId),
        studio.readSamplePreview(listing.pipelineId, listing.approvedVersion),
      ]);
      return { listing, review, disclosure, preview };
    },
  };

  const myPipelines: MyPipelinesScreenPort = {
    backing: backingOf(studio),
    async listCreatorRecords(creator: string): Promise<readonly CreatorPipelineRecord[]> {
      const listings = await studio.listListings();
      return listings
        .filter((listing) => listing.publisher === creator)
        .map(creatorRecordFromListing)
        // The submission-read seam (DRAFT/SUBMITTED states) does not exist
        // at this SHA: the gap is declared per port docs + report, never
        // filled with disguised data here.
        .concat([
          {
            listingId: null,
            pipelineId: "seam:submission-reads",
            title: "Draft and in-review submissions",
            publisher: creator,
            status: "SEAM-MISSING",
            creatorState: creatorStateFor("DRAFT"),
            origin: "record",
            approvedVersion: null,
            reviewedAt: null,
            note: "Draft/submitted/changes-requested states need the marketplace submission-read seam (not on the current read model). Recorded in NEXT DEPENDENCIES — no fixture row is invented here.",
          },
        ]);
    },
    async readCreatorVersionStatus(
      pipelineId: string,
      version: string,
    ): Promise<MarketplaceReviewShape | ScreenRefusal> {
      const review = await studio.readReviewStatus(pipelineId, version);
      if (review === null) {
        return {
          reason: `no review decision recorded for ${pipelineId} v${version} in the marketplace read model`,
        };
      }
      return review;
    },
  };

  return { marketplace, myPipelines };
}

/** Disclosure reads may refuse typed (unknown listing) — keep that honest. */
async function readDisclosureCarefully(
  studio: MarketplaceStudioReadShape,
  listingId: string,
): Promise<MarketplaceDisclosureShape | null> {
  try {
    return await studio.readLaunchDisclosure(listingId);
  } catch (error) {
    // The seam's own typed error message surfaces in the screen; here the
    // detail view degrades to "disclosure unavailable" WITH the reason.
    return {
      listingId,
      publisher: "unavailable",
      approvedVersion: "unavailable",
      releaseDigest: "",
      terms: { kind: "free", price: null, termsLicense: "unavailable" },
      rightsPrerequisites: [],
      dependencies: [],
      outputs: [],
      limitations: [
        `launch disclosure unavailable: ${error instanceof Error ? error.message : String(error)}`,
      ],
      cost: null,
      latencyExpectations: { typicalLatencyMs: 0, declaredThroughput: "unavailable", evidenceGrade: "declared" },
      evidenceGrade: "declared",
      reviewedAt: "unavailable",
      legalNotice: "unavailable",
    };
  }
}
