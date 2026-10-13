/**
 * FIXTURE manifest source (adapters layer) — EVIDENCE CLASS: FIXTURE.
 *
 * The manifest read seam (`TransformManifestReadPort`): the real
 * product-side transform-manifest store is a TL seam (see the worker
 * report's NEXT DEPENDENCIES). Tests inject this deterministic
 * fixture source; unresolvable reads are honest nulls and callers
 * refuse typed (fail-closed), never guess.
 */
import type {
  ContentHash,
  SportaId,
  TransformPipelineManifest,
} from "@sporta/marketplace/contract";
import type { TransformManifestReadPort } from "../domain/ports.js";

export class FixtureManifestSource implements TransformManifestReadPort {
  private readonly manifests = new Map<string, TransformPipelineManifest>();

  register(manifest: TransformPipelineManifest): void {
    const key = this.keyFor(manifest.pipelineId, manifest.version, manifest.manifestDigest);
    this.manifests.set(key, structuredClone(manifest));
  }

  read(
    pipelineId: SportaId,
    version: string,
    manifestDigest: ContentHash,
  ): TransformPipelineManifest | null {
    const found = this.manifests.get(this.keyFor(pipelineId, version, manifestDigest));
    return found === undefined ? null : structuredClone(found);
  }

  private keyFor(pipelineId: SportaId, version: string, manifestDigest: ContentHash): string {
    return `${pipelineId}@${version}@${manifestDigest}`;
  }
}
