/**
 * sporta-artifacts — the Artifact Fabric.
 *
 * Durable, content-addressed, lineage-preserving artifact objects.
 * Workers may be ephemeral; canonical artifacts may not. Execution
 * loss must never destroy canonical user work.
 *
 * Single public entrypoint: type declarations live in the domain layer
 * and are re-exported here (entrypoint-only convention, same as
 * sporta-contracts); implementations are re-exported for wiring.
 */
export type {
  ArtifactRecord,
  ArtifactRevisionRecord,
  EditDeltaRecord,
} from "@sporta/contracts/contract";

export type {
  RecordArtifactInput,
  CommitRevisionInput,
  ArtifactGraphPort,
  ArtifactClock,
  ArtifactContentHashFn,
  ArtifactBlobStorePort,
} from "./domain/ports.js";

export {
  ArtifactError,
  LineageIntegrityError,
  UnknownArtifactError,
  ArtifactIntegrityError,
  ArtifactBlobNotFoundError,
} from "./domain/errors.js";

export { ArtifactGraphService } from "./app/ArtifactGraphService.js";

export { InMemoryArtifactBlobStore } from "./adapters/InMemoryArtifactBlobStore.js";
export { FsArtifactBlobStore } from "./adapters/FsArtifactBlobStore.js";
export { FixedClock, SystemClock } from "./adapters/clock.js";
export { sha256Content, sha256Text } from "./adapters/hash.js";
