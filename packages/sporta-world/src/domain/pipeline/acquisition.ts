import type {
  Confidence,
  Iso8601,
  PolicySet,
  ProvenanceDescriptor,
  SportaId,
} from "@sporta/contracts/contract";
import { isValidConfidence } from "../snapshot.js";
import { AcquisitionProvenanceError, AcquisitionRightsError } from "./errors.js";
import type { AcquisitionChain } from "./provenance.js";
import { isNonEmptyString, isPlainObject } from "./provenance.js";

/**
 * Stage 1 — acquisition (domain layer — pure).
 *
 * An authorized source declaration (media refs, rights scope,
 * provenance seed) becomes a typed acquisition record — the authorized
 * chain root every downstream record cites. Fail-closed: non-authorized
 * source kinds and rights scopes that affirm no usage are refused
 * BEFORE any observation enters the chain.
 */

/** One media reference an authorized acquisition declares. */
export interface MediaRef {
  mediaId: SportaId;
  /** Free-form kind vocabulary, e.g. "video", "telemetry" (non-empty). */
  kind: string;
  capturedAt: Iso8601;
}

/** Authorized source declaration: media refs, rights scope, provenance seed. */
export interface AcquisitionManifest {
  manifestId: SportaId;
  domain: string;
  provenanceSeed: ProvenanceDescriptor;
  mediaRefs: readonly MediaRef[];
  /** The declared policy; its rights scope authorizes the acquisition. */
  policy: PolicySet;
  /** Optional additional source-level confidence narrowing (never raises). */
  sourceConfidenceCeiling?: Confidence;
}

/** The validated acquisition record — the authorized chain root. */
export interface AcquisitionRecord {
  chain: AcquisitionChain;
  mediaRefs: readonly MediaRef[];
  policy: PolicySet;
  /** Effective source ceiling: min(seed confidence, declared ceiling). */
  sourceConfidenceCeiling: Confidence;
}

/** Acquisition gate: only the seam's ingestible vocabulary may enter. */
function isAuthorizedSourceKind(
  sourceKind: ProvenanceDescriptor["sourceKind"],
): sourceKind is "authorized-source" | "observation" {
  return sourceKind === "authorized-source" || sourceKind === "observation";
}

/**
 * Acquire a batch of authorized sources. Deterministic and idempotent
 * per batch: the same manifests yield the same records in order.
 * Manifest ids must be unique in the batch; all manifests in one batch
 * must declare the same domain.
 */
export function acquireSources(manifests: readonly AcquisitionManifest[]): AcquisitionRecord[] {
  const seenManifestIds = new Set<SportaId>();
  let declaredDomain: string | null = null;
  const records: AcquisitionRecord[] = [];
  for (const manifest of manifests) {
    const chain = validateManifest(manifest, seenManifestIds);
    if (declaredDomain === null) {
      declaredDomain = chain.domain;
    } else if (chain.domain !== declaredDomain) {
      throw new AcquisitionProvenanceError(
        `acquisition batch mixes domains "${declaredDomain}" and "${chain.domain}"`,
        `${declaredDomain}|${chain.domain}`,
      );
    }
    seenManifestIds.add(manifest.manifestId);
    records.push(buildRecord(manifest, chain));
  }
  return records;
}

/** Validate one manifest and return its narrowed authorized chain. */
function validateManifest(
  manifest: AcquisitionManifest,
  seenManifestIds: Set<SportaId>,
): AcquisitionChain {
  if (!isPlainObject(manifest)) {
    throw new AcquisitionProvenanceError("acquisition manifest must be an object", "manifest");
  }
  if (!isNonEmptyString(manifest.manifestId)) {
    throw new AcquisitionProvenanceError("manifestId must be a non-empty string", "manifestId");
  }
  if (seenManifestIds.has(manifest.manifestId)) {
    throw new AcquisitionProvenanceError(
      `duplicate manifestId "${manifest.manifestId}" in one batch`,
      `duplicate:${manifest.manifestId}`,
    );
  }
  if (!isNonEmptyString(manifest.domain)) {
    throw new AcquisitionProvenanceError(
      "manifest domain must be a non-empty string",
      `manifest:${manifest.manifestId}`,
    );
  }
  const seed = manifest.provenanceSeed;
  if (!isPlainObject(seed)) {
    throw new AcquisitionProvenanceError(
      "provenanceSeed must be an object",
      `manifest:${manifest.manifestId}`,
    );
  }
  const sourceKind = seed.sourceKind;
  if (!isAuthorizedSourceKind(sourceKind)) {
    throw new AcquisitionProvenanceError(
      `acquisition provenance sourceKind "${String(sourceKind)}" is not an authorized source kind`,
      `source-kind:${String(sourceKind)}`,
    );
  }
  if (!isNonEmptyString(seed.sourceRef)) {
    throw new AcquisitionProvenanceError(
      "provenanceSeed.sourceRef must be a non-empty string",
      `manifest:${manifest.manifestId}`,
    );
  }
  if (seed.confidence === undefined || !isValidConfidence(seed.confidence)) {
    // Fail-closed: the authorized source must DECLARE its seed confidence.
    throw new AcquisitionProvenanceError(
      "the authorized source must declare a seed confidence in [0, 1]",
      `seed-confidence:${String(seed.confidence)}`,
    );
  }
  if (
    manifest.sourceConfidenceCeiling !== undefined &&
    !isValidConfidence(manifest.sourceConfidenceCeiling)
  ) {
    throw new AcquisitionProvenanceError(
      `sourceConfidenceCeiling ${manifest.sourceConfidenceCeiling} is outside [0, 1]`,
      `ceiling:${manifest.sourceConfidenceCeiling}`,
    );
  }
  if (!Array.isArray(manifest.mediaRefs) || manifest.mediaRefs.length === 0) {
    throw new AcquisitionProvenanceError(
      "a manifest must declare at least one media ref",
      `no-media:${manifest.manifestId}`,
    );
  }
  const mediaIds = new Set<SportaId>();
  for (const media of manifest.mediaRefs) {
    if (!isPlainObject(media)) {
      throw new AcquisitionProvenanceError(
        "media ref must be an object",
        `manifest:${manifest.manifestId}`,
      );
    }
    if (!isNonEmptyString(media.mediaId)) {
      throw new AcquisitionProvenanceError(
        "mediaId must be a non-empty string",
        `manifest:${manifest.manifestId}`,
      );
    }
    if (mediaIds.has(media.mediaId)) {
      throw new AcquisitionProvenanceError(
        `duplicate mediaId "${media.mediaId}" in manifest "${manifest.manifestId}"`,
        `duplicate-media:${media.mediaId}`,
      );
    }
    if (!isNonEmptyString(media.kind) || !isNonEmptyString(media.capturedAt)) {
      throw new AcquisitionProvenanceError(
        "media refs must declare a non-empty kind and capturedAt",
        `media:${media.mediaId}`,
      );
    }
    mediaIds.add(media.mediaId);
  }
  const policy = manifest.policy;
  if (!isPlainObject(policy) || !isPlainObject(policy.rights)) {
    throw new AcquisitionRightsError(
      "the manifest must declare a policy with a rights scope",
      `manifest:${manifest.manifestId}`,
    );
  }
  const usages = policy.rights.usages;
  if (!Array.isArray(usages) || usages.length === 0) {
    // Fail-closed: a scope that affirms no usage authorizes nothing.
    throw new AcquisitionRightsError(
      "the manifest's rights scope must declare at least one usage class (a scope that affirms nothing authorizes nothing)",
      `manifest:${manifest.manifestId}`,
    );
  }
  return {
    acquisitionId: manifest.manifestId,
    domain: manifest.domain,
    sourceKind,
    sourceRef: seed.sourceRef,
  };
}

function buildRecord(manifest: AcquisitionManifest, chain: AcquisitionChain): AcquisitionRecord {
  const seed = manifest.provenanceSeed;
  return {
    chain,
    mediaRefs: manifest.mediaRefs.map((media) => ({ ...media })),
    policy: manifest.policy,
    sourceConfidenceCeiling: Math.min(seed.confidence ?? 1, manifest.sourceConfidenceCeiling ?? 1),
  };
}
