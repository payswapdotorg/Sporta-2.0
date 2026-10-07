/**
 * sporta-editors — the Editor Broker and external editor adapters.
 *
 * Integration levels: 1 export, 2 round-trip, 3 live/shared session.
 * External applications are capabilities/adapters, never semantic
 * authorities; their project files never become canonical Sporta state.
 *
 * Single public entrypoint: type declarations live in the domain layer
 * and are re-exported here (entrypoint-only convention); implementations
 * are re-exported for wiring. The v1 export surface is unchanged; Wave 1
 * additions are purely additive.
 */
export type {
  EditDeltaRecord,
  EditorSessionRecord,
  ArtifactRevisionRecord,
} from "@sporta/contracts/contract";

export type { ArtifactGraphPort } from "@sporta/artifacts/contract";

export type {
  ResolveEditorInput,
  EditorAvailability,
  EditorResolution,
  OpenEditorSessionInput,
  ReconcileSessionInput,
  ReconcileResult,
  EditorBrokerPort,
  EditorAdapterPort,
  EditorSessionStorePort,
  EditorClock,
  EditorHashFn,
  EditorBrokerDeps,
} from "./domain/ports.js";

export type { EditOperation } from "./domain/operations.js";
export { serializeEditOperation, parseEditOperation } from "./domain/operations.js";

export {
  requiredIntegrationLevel,
  licensePermitsUsage,
  resolveEditorChoice,
} from "./domain/resolution.js";

export {
  EditorError,
  EditorResolutionError,
  EditorRightsRefusalError,
  UnknownEditorError,
  UnknownRevisionError,
  UnknownEditorSessionError,
} from "./domain/errors.js";

export { EditorBrokerService } from "./app/EditorBrokerService.js";

export { InMemoryEditorSessionStore } from "./adapters/InMemoryEditorSessionStore.js";
export { KdenliveFixtureAdapter, MysteryAppFixtureAdapter } from "./adapters/editors.js";
export { sha256EditorHash } from "./adapters/hash.js";
export { FixedClock, SystemClock } from "./adapters/clock.js";
