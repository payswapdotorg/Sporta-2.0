/**
 * Launch disclosure (domain — pure, P9-12/16/17).
 *
 * What the launch UI must show BEFORE a run starts: publisher, approved
 * version, terms/price, rights prerequisites, dependencies, outputs,
 * limitations, cost/latency expectations, evidence grade and review
 * date — plus the fixed legal notice that visual similarity NEVER
 * implies clearance (lock 34 / ADR product rule 5: no copyright-immunity
 * promise, "copyright-safe" claims are forbidden).
 */
import type {
  ContentHash,
  Iso8601,
  SportaId,
  TransformListing,
  TransformPipelineManifest,
} from "@sporta/marketplace/contract";

/** The fixed, non-negotiable legal notice carried by every disclosure. */
export const TRANSFORM_LAUNCH_LEGAL_NOTICE =
  "Visual or measured similarity to source material is a quality signal and review trigger only; it never implies legal clearance, copyright safety, or authorized use. Rights prerequisites must be satisfied for every invocation.";

/** The typed disclosure record shown before feed launch (P9-12). */
export interface TransformLaunchDisclosure {
  readonly listingId: SportaId;
  readonly publisher: string;
  /** The exact approved release this launch would pin. */
  readonly approvedVersion: string;
  readonly releaseDigest: ContentHash;
  /** Free/paid terms + price exactly as offered. */
  readonly terms: TransformListing["offer"];
  /** Rights prerequisites the caller must satisfy (P9-14). */
  readonly rightsPrerequisites: readonly string[];
  /** Pinned dependencies (name/kind/digest/license) — never hidden. */
  readonly dependencies: readonly {
    readonly kind: string;
    readonly name: string;
    readonly digest: string;
    readonly license: string;
  }[];
  readonly outputs: readonly string[];
  readonly limitations: readonly string[];
  /** Cost + latency/resource expectations with their evidence grade. */
  readonly cost: { readonly amount: number; readonly currency: string } | null;
  readonly latencyExpectations: TransformListing["expectations"];
  /** Honest evidence grade for the expectations above. */
  readonly evidenceGrade: "measured" | "fixture" | "declared";
  readonly reviewedAt: Iso8601;
  /** Fixed legal notice (similarity is never clearance). */
  readonly legalNotice: string;
}

/**
 * Build the disclosure from a listing plus its pinned manifest. The
 * manifest is REQUIRED: dependencies are never hidden — an unresolvable
 * manifest is the caller's typed error (the service refuses disclosure,
 * it does not guess). Pure projection, no IO.
 */
export function buildLaunchDisclosure(
  listing: TransformListing,
  manifest: TransformPipelineManifest,
): TransformLaunchDisclosure {
  return {
    listingId: listing.listingId,
    publisher: listing.publisher,
    approvedVersion: listing.currentRelease.version,
    releaseDigest: listing.currentRelease.releaseDigest,
    terms: listing.offer,
    rightsPrerequisites: [...listing.rightsPrerequisites],
    dependencies: manifest.pinnedDependencies.map((dependency) => ({
      kind: dependency.kind,
      name: dependency.name,
      digest: dependency.digest,
      license: dependency.license,
    })),
    outputs: [...listing.expectedOutputs],
    limitations: [...listing.limitations],
    cost: listing.offer.price,
    latencyExpectations: listing.expectations,
    evidenceGrade: listing.expectations.evidenceGrade,
    reviewedAt: listing.currentRelease.reviewedAt,
    legalNotice: TRANSFORM_LAUNCH_LEGAL_NOTICE,
  };
}
