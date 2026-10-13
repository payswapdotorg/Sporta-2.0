/**
 * W9B-4 — the launch disclosure record (domain layer — pure).
 *
 * P9-12: before launch the user sees publisher, approved version,
 * free/paid terms and price, rights prerequisites, dependencies,
 * outputs, limitations, cost/latency expectations and the evidence
 * grade (measured-vs-fixture labeled). P9-17: the provenance note
 * points to the source rights scope and the pipeline release
 * WITHOUT guaranteeing legality for every downstream use. Similarity
 * is never mentioned as clearance (P9-16).
 */
import type { ContentHash, Iso8601, SportaId } from "@sporta/contracts/contract";
import type { TransformPipelineManifest } from "@sporta/transforms/contract";
import type { TransformListing, TransformOfferTerms } from "@sporta/marketplace/contract";

/** The typed disclosure the launch UI renders (additive public name). */
export interface TransformLaunchDisclosure {
  listingId: SportaId;
  pipelineId: SportaId;
  publisher: string;
  approvedVersion: string;
  releaseDigest: ContentHash;
  reviewedAt: Iso8601;
  /** Free/paid terms with price (P9-12). */
  offer: TransformOfferTerms;
  /** Distinct rights prerequisite ids the user must satisfy (P9-15). */
  rightsPrerequisites: readonly string[];
  /** Pinned dependencies with licenses (manifest-sourced when resolvable). */
  dependencies: readonly {
    kind: string;
    name: string;
    digest: string;
    license: string;
  }[];
  expectedOutputs: readonly string[];
  limitations: readonly string[];
  /** Cost expectation: per-run price or free (P9-12). */
  costExpectation: { amount: number | null; currency: string | null; basis: string };
  latencyExpectation: {
    typicalLatencyMs: number;
    declaredThroughput: string;
  };
  /** Measured-vs-fixture label carried from the listing (P9-12). */
  evidenceGrade: "measured" | "fixture" | "declared";
  /**
   * P9-17: output provenance points to the source rights scope and
   * the pipeline release; it never guarantees legality for every
   * downstream use.
   */
  provenanceNote: string;
  generatedAt: Iso8601;
}

/** Inputs for assembling one disclosure (pure). */
export interface BuildDisclosureInput {
  listing: TransformListing;
  /** The approved candidate's pinned manifest, when re-resolvable. */
  manifest: TransformPipelineManifest | null;
  /** Fallback dependency descriptors from the candidate content hashes. */
  candidateContentHashes: readonly { kind: string; digest: string }[];
  generatedAt: Iso8601;
}

/**
 * Assemble the disclosure. Honest degradation: an unresolvable
 * manifest falls back to the candidate's content hashes with license
 * "unverified" AND appends an explicit limitation entry — never a
 * silent hide.
 */
export function buildLaunchDisclosure(input: BuildDisclosureInput): TransformLaunchDisclosure {
  const { listing, manifest } = input;
  const limitations = [...listing.limitations];
  let dependencies: TransformLaunchDisclosure["dependencies"];

  if (manifest !== null) {
    dependencies = manifest.pinnedDependencies.map((dependency) => ({
      kind: dependency.kind,
      name: dependency.name,
      digest: dependency.digest,
      license: dependency.license,
    }));
  } else {
    dependencies = input.candidateContentHashes.map((entry) => ({
      kind: entry.kind,
      name: entry.kind,
      digest: entry.digest,
      license: "unverified",
    }));
    limitations.push(
      "pinned dependency manifest could not be re-resolved at disclosure time — dependency licenses unverified",
    );
  }

  const costExpectation =
    listing.offer.kind === "free" || listing.offer.price === null
      ? { amount: null, currency: null, basis: "free offer — no charge per run" }
      : {
          amount: listing.offer.price.amount,
          currency: listing.offer.price.currency,
          basis: `${listing.offer.kind} offer — price shown before launch`,
        };

  return {
    listingId: listing.listingId,
    pipelineId: listing.pipelineId,
    publisher: listing.publisher,
    approvedVersion: listing.currentRelease.version,
    releaseDigest: listing.currentRelease.releaseDigest,
    reviewedAt: listing.currentRelease.reviewedAt,
    offer: listing.offer,
    rightsPrerequisites: [...listing.rightsPrerequisites],
    dependencies,
    expectedOutputs: [...listing.expectedOutputs],
    limitations,
    costExpectation,
    latencyExpectation: {
      typicalLatencyMs: listing.expectations.typicalLatencyMs,
      declaredThroughput: listing.expectations.declaredThroughput,
    },
    evidenceGrade: listing.expectations.evidenceGrade,
    provenanceNote:
      `output provenance points to the source rights scope and pipeline release ${listing.currentRelease.releaseDigest} ` +
      `(version ${listing.currentRelease.version}, reviewed ${listing.currentRelease.reviewedAt}); ` +
      "no guarantee of legality for every downstream use — similarity or visual difference is never clearance",
    generatedAt: input.generatedAt,
  };
}
