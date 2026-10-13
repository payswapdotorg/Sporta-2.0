/**
 * W9B-2 — material-change detection between two release candidates
 * (domain layer — pure). P9-09: a changed code/model/weights/
 * dependency/permission/license/source/runtime digest REQUIRES a new
 * immutable candidate and separate review. Detection compares the
 * frozen candidate records (manifest digest, per-kind content
 * hashes, attestations) and, when the pinned manifests resolve, the
 * behavioral manifest fields (pinned dependency digests/licenses,
 * node component digests, required permissions).
 *
 * The report is EVIDENCE, never a gate bypass: material or not,
 * every new candidate repeats the full review — the publication
 * service enforces that structurally.
 */
import type {
  TransformPipelineManifest,
  TransformReleaseCandidate,
} from "@sporta/transforms/contract";

/** One typed material-change observation. */
export interface TransformMaterialChange {
  field: string;
  from: string;
  to: string;
}

/** The typed materiality report recorded at submission time. */
export interface TransformMaterialChangeReport {
  pipelineId: string;
  fromVersion: string;
  toVersion: string;
  material: boolean;
  changes: readonly TransformMaterialChange[];
}

/** Compare two candidates (plus optional pinned manifests). Pure. */
export function detectMaterialChange(
  previous: TransformReleaseCandidate,
  next: TransformReleaseCandidate,
  manifests: {
    previous: TransformPipelineManifest | null;
    next: TransformPipelineManifest | null;
  } = { previous: null, next: null },
): TransformMaterialChangeReport {
  const changes: TransformMaterialChange[] = [];

  if (previous.manifestDigest !== next.manifestDigest) {
    changes.push({ field: "manifest-digest", from: previous.manifestDigest, to: next.manifestDigest });
  }

  const previousHashes = new Map(previous.contentHashes.map((entry) => [entry.kind, entry.digest]));
  for (const entry of next.contentHashes) {
    const from = previousHashes.get(entry.kind);
    if (from === undefined) {
      changes.push({ field: `content-hash:${entry.kind}`, from: "absent", to: entry.digest });
    } else if (from !== entry.digest) {
      changes.push({ field: `content-hash:${entry.kind}`, from, to: entry.digest });
    }
  }
  for (const [kind, digest] of previousHashes) {
    if (!next.contentHashes.some((entry) => entry.kind === kind)) {
      changes.push({ field: `content-hash:${kind}`, from: digest, to: "absent" });
    }
  }

  const previousAttestations = new Set(previous.attestations.map((entry) => `${entry.kind}:${entry.reference}`));
  for (const entry of next.attestations) {
    if (!previousAttestations.has(`${entry.kind}:${entry.reference}`)) {
      changes.push({ field: `attestation:${entry.kind}`, from: "absent-or-different", to: entry.reference });
    }
  }

  if (manifests.previous !== null && manifests.next !== null) {
    const previousDeps = new Map(manifests.previous.pinnedDependencies.map((dep) => [dep.name, dep]));
    for (const dep of manifests.next.pinnedDependencies) {
      const from = previousDeps.get(dep.name);
      if (from === undefined) {
        changes.push({ field: `pinned-dependency:${dep.name}`, from: "absent", to: dep.digest });
      } else {
        if (from.digest !== dep.digest) {
          changes.push({ field: `pinned-dependency:${dep.name}:digest`, from: from.digest, to: dep.digest });
        }
        if (from.license !== dep.license) {
          changes.push({ field: `pinned-dependency:${dep.name}:license`, from: from.license, to: dep.license });
        }
      }
    }
    const previousNodes = new Map(manifests.previous.nodes.map((node) => [node.nodeId, node]));
    for (const node of manifests.next.nodes) {
      const from = previousNodes.get(node.nodeId);
      if (from === undefined) {
        changes.push({ field: `node:${node.nodeId}`, from: "absent", to: node.componentRef.digest });
      } else {
        if (from.componentRef.digest !== node.componentRef.digest) {
          changes.push({ field: `node:${node.nodeId}:component-digest`, from: from.componentRef.digest, to: node.componentRef.digest });
        }
        const fromPermissions = from.requiredPermissions.join(",");
        const toPermissions = node.requiredPermissions.join(",");
        if (fromPermissions !== toPermissions) {
          changes.push({ field: `node:${node.nodeId}:permissions`, from: fromPermissions, to: toPermissions });
        }
      }
    }
    if (manifests.previous.licensing.license !== manifests.next.licensing.license) {
      changes.push({
        field: "license",
        from: manifests.previous.licensing.license,
        to: manifests.next.licensing.license,
      });
    }
  }

  return {
    pipelineId: next.pipelineId,
    fromVersion: previous.version,
    toVersion: next.version,
    material: changes.length > 0,
    changes,
  };
}
