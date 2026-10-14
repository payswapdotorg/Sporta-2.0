/**
 * The marketplace screen browser FIXTURE host (W11C — the
 * studioBrowserFixture.ts precedent, for the destination screens).
 *
 * EVIDENCE CLASS: FIXTURE, labeled at the point of use. The REAL
 * marketplace services are headless Node legs (the W4-C/W10-A
 * composition law) and cannot execute in a browser bundle; this host
 * carries static fixture snapshots so the destination screens are
 * exercisable in the browser demo. NOTHING here is ever claimed real;
 * every record's limitations field says so, and the screen's backing
 * badge reads FIXTURE.
 *
 * Fixture creator records include DRAFT/SUBMITTED/CHANGES_REQUESTED
 * demo rows with `origin: "fixture-demo"` — the real submission states
 * need the marketplace submission-read seam (NEXT DEPENDENCIES).
 */
import type {
  CreatorPipelineRecord,
  MarketplaceListingDetail,
  MarketplaceListingShape,
  MarketplaceScreenPort,
  MyPipelinesScreenPort,
} from "./marketplaceScreenPorts.js";

const FIXTURE_DIGEST = "sha256:" + "7c".repeat(32);

const FIXTURE_LISTINGS: readonly MarketplaceListingShape[] = [
  {
    listingId: "list:fixture-market-highlights",
    pipelineId: "pipe:fixture-market-highlights",
    title: "Fixture highlights trim (marketplace demo)",
    description: "Fixture demo listing — trims a prerecorded feed to the highlights window.",
    publisher: "publisher:fixture-market",
    status: "PUBLISHED",
    approvedVersion: "1.0.0",
    releaseDigest: FIXTURE_DIGEST,
    category: "video",
    supportedFeedTypes: ["prerecorded"],
    expectedOutputs: ["trimmed event stream"],
    limitations: ["fixture listing — browser demo content only"],
    offer: { kind: "free", price: null, termsLicense: "MIT" },
    compatibility: ["local"],
    support: "publisher:fixture-market",
    expectations: { typicalLatencyMs: 800, declaredThroughput: "single stream", evidenceGrade: "fixture" },
    rightsPrerequisites: ["authorized source footage"],
    versionHistory: [
      { version: "1.0.0", releaseDigest: FIXTURE_DIGEST, changelog: "fixture release 1.0.0" },
    ],
  },
  {
    listingId: "list:fixture-market-boards",
    pipelineId: "pipe:fixture-market-boards",
    title: "Fixture tag boards (suspended, marketplace demo)",
    publisher: "publisher:fixture-market",
    status: "SUSPENDED",
    approvedVersion: "1.0.0",
    releaseDigest: "sha256:" + "5f".repeat(32),
    category: "video",
    supportedFeedTypes: ["prerecorded"],
    expectedOutputs: ["tag-board overlay"],
    limitations: ["fixture listing — browser demo content only", "suspended: new runs blocked, history kept"],
    offer: { kind: "free", price: null, termsLicense: "MIT" },
    compatibility: ["local"],
    support: "publisher:fixture-market",
    expectations: { typicalLatencyMs: 600, declaredThroughput: "single stream", evidenceGrade: "fixture" },
    rightsPrerequisites: ["authorized source footage"],
    versionHistory: [
      { version: "1.0.0", releaseDigest: "sha256:" + "5f".repeat(32), changelog: "fixture release 1.0.0" },
    ],
  },
];

const FIXTURE_REVIEWS: Readonly<Record<string, MarketplaceListingDetail["review"]>> = {
  "list:fixture-market-highlights": {
    outcome: "approved",
    decidedAt: "2026-10-13T12:03:00.000Z",
    policyVersion: "policy:fixture-market-v1",
    rationale: "fixture review content — three roles signed the demo record",
    reviewerRoles: ["product", "rights", "security"],
    automatedChecks: [
      { checkId: "dependency-scan", outcome: "pass", evidenceKind: "fixture" },
      { checkId: "graph-validation", outcome: "pass", evidenceKind: "fixture" },
    ],
  },
};

const FIXTURE_DISCLOSURES: Readonly<Record<string, MarketplaceListingDetail["disclosure"]>> = {
  "list:fixture-market-highlights": {
    listingId: "list:fixture-market-highlights",
    publisher: "publisher:fixture-market",
    approvedVersion: "1.0.0",
    releaseDigest: FIXTURE_DIGEST,
    terms: { kind: "free", price: null, termsLicense: "MIT" },
    rightsPrerequisites: ["authorized source footage"],
    dependencies: [
      { kind: "code", name: "json-event-stream-trim", digest: FIXTURE_DIGEST, license: "MIT" },
    ],
    outputs: ["trimmed event stream"],
    limitations: ["fixture listing — browser demo content only"],
    cost: null,
    latencyExpectations: { typicalLatencyMs: 800, declaredThroughput: "single stream", evidenceGrade: "fixture" },
    evidenceGrade: "fixture",
    reviewedAt: "2026-10-13T12:03:00.000Z",
    legalNotice:
      "Fixture demo disclosure. The real legal notice rides the launch disclosure from the marketplace seam.",
  },
};

const FIXTURE_SEAM_NOTE =
  "fixture demo row — the real submission-state seam is NEXT DEPENDENCIES; this row is labeled fixture and never passes as a record";

/** Fixture creator records: real-shaped listing rows + labeled demo rows. */
function fixtureCreatorRecords(): readonly CreatorPipelineRecord[] {
  const fromListings = FIXTURE_LISTINGS.map((listing) => ({
    listingId: listing.listingId,
    pipelineId: listing.pipelineId,
    title: listing.title,
    publisher: listing.publisher,
    status: listing.status,
    creatorState:
      listing.status === "PUBLISHED" ? ("released" as const) : ("suspended" as const),
    origin: "record" as const,
    approvedVersion: listing.approvedVersion,
    reviewedAt: null,
    note: null,
  }));
  const demoStates: readonly CreatorPipelineRecord[] = [
    {
      listingId: null,
      pipelineId: "pipe:fixture-market-draft",
      title: "Fixture draft pipeline (demo)",
      publisher: "publisher:fixture-market",
      status: "DRAFT",
      creatorState: "draft",
      origin: "fixture-demo",
      approvedVersion: null,
      reviewedAt: null,
      note: FIXTURE_SEAM_NOTE,
    },
    {
      listingId: null,
      pipelineId: "pipe:fixture-market-submitted",
      title: "Fixture submitted pipeline (demo)",
      publisher: "publisher:fixture-market",
      status: "SUBMITTED",
      creatorState: "submitted",
      origin: "fixture-demo",
      approvedVersion: "0.9.0",
      reviewedAt: null,
      note: FIXTURE_SEAM_NOTE,
    },
    {
      listingId: null,
      pipelineId: "pipe:fixture-market-changes",
      title: "Fixture changes-requested pipeline (demo)",
      publisher: "publisher:fixture-market",
      status: "CHANGES_REQUESTED",
      creatorState: "changes-requested",
      origin: "fixture-demo",
      approvedVersion: "0.9.0",
      reviewedAt: "2026-10-12T09:00:00.000Z",
      note: FIXTURE_SEAM_NOTE,
    },
  ];
  return [...fromListings, ...demoStates];
}

/** The labeled FIXTURE marketplace + my-pipelines hosts (see file header). */
export function createMarketplaceFixtureHost(): {
  marketplace: MarketplaceScreenPort;
  myPipelines: MyPipelinesScreenPort;
} {
  const marketplace: MarketplaceScreenPort = {
    backing: "fixture",
    async listPublicListings() {
      return FIXTURE_LISTINGS.map((listing) => ({ ...listing }));
    },
    async readListingDetail(listingId: string): Promise<MarketplaceListingDetail> {
      const listing = FIXTURE_LISTINGS.find((entry) => entry.listingId === listingId);
      if (listing === undefined) {
        throw new Error(`fixture host: no listing ${listingId} (typed refusal — never a fabricated detail)`);
      }
      return {
        listing: { ...listing },
        review: FIXTURE_REVIEWS[listingId] ?? null,
        disclosure: FIXTURE_DISCLOSURES[listingId] ?? null,
        preview: null,
      };
    },
  };

  const myPipelines: MyPipelinesScreenPort = {
    backing: "fixture",
    async listCreatorRecords(creator: string) {
      return fixtureCreatorRecords().filter((record) => record.publisher === creator);
    },
    async readCreatorVersionStatus(pipelineId: string, version: string) {
      const listing = FIXTURE_LISTINGS.find((entry) => entry.pipelineId === pipelineId);
      const review = listing === undefined ? undefined : FIXTURE_REVIEWS[listing.listingId];
      return review ?? { reason: `fixture host: no review decision recorded for ${pipelineId} v${version}` };
    },
  };

  return { marketplace, myPipelines };
}
