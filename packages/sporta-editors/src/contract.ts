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

export type {
  EditorSessionSummary,
  EditorSessionHistoryQuery,
  EditorSessionHistoryReadPort,
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

export type {
  EditorSessionHistoryUsageContext,
  EditorSessionHistoryListInput,
  EditorSessionHistoryFilter,
  EditorSessionHistoryStorePort,
  EditorSessionHistoryDeps,
} from "./domain/history.js";
export {
  EDITOR_SESSION_HISTORY_DEFAULT_LIMIT,
  EDITOR_SESSION_HISTORY_MAX_LIMIT,
  resolveEditorSessionHistoryLimit,
  sessionVisibleToUsage,
  toEditorSessionSummary,
  matchesEditorSessionHistoryFilter,
  compareEditorSessionsNewestFirst,
} from "./domain/history.js";

export {
  requiredIntegrationLevel,
  licensePermitsUsage,
  resolveEditorChoice,
} from "./domain/resolution.js";

export {
  EditorError,
  EditorResolutionError,
  EditorRightsRefusalError,
  EditorRetentionRefusalError,
  UnknownEditorError,
  UnknownRevisionError,
  UnknownEditorSessionError,
  EditorSessionHistoryQueryError,
  EditorSessionHistoryIntegrityError,
} from "./domain/errors.js";

export { EditorBrokerService } from "./app/EditorBrokerService.js";
export { EditorSessionHistoryService } from "./app/EditorSessionHistoryService.js";

export { InMemoryEditorSessionStore } from "./adapters/InMemoryEditorSessionStore.js";
export { InMemoryEditorSessionHistoryStore } from "./adapters/InMemoryEditorSessionHistoryStore.js";
export { FsEditorSessionHistoryStore } from "./adapters/FsEditorSessionHistoryStore.js";
export { KdenliveFixtureAdapter, MysteryAppFixtureAdapter } from "./adapters/editors.js";
export { KdenliveAdapter, KdenliveXmlError } from "./adapters/KdenliveAdapter.js";
export type {
  KdenliveProjectState,
  KdenliveMlt,
  KdenliveProducer,
  KdenlivePlaylist,
  KdenliveTractor,
  KdenliveEntry,
  KdenliveTrack,
  KdenliveRawElement,
} from "./adapters/KdenliveAdapter.js";
export { sha256EditorHash } from "./adapters/hash.js";
export { FixedClock, SystemClock } from "./adapters/clock.js";

// ---------------------------------------------------------------------------
// Wave 6 (w6a) — live/shared editor sessions (integration level 3).
// Additive-only: new surface under domain/sharedSession/ + one app
// service + stores; every Wave 1/3/4 signature above is untouched.
// ---------------------------------------------------------------------------

export {
  SharedSessionError,
  SharedSessionAdmissionError,
  SharedSessionConflictError,
  SharedSessionClosedError,
  UnknownSharedSessionError,
  UnknownSharedParticipantError,
  SharedSessionOrderError,
  SharedSessionIntegrityError,
} from "./domain/sharedSession/errors.js";

export type {
  SharedSessionUsageContext,
  SharedSessionLeaveReason,
  SharedSessionAdmission,
  SharedSessionParticipant,
  ParticipantAdmissionRequest,
  SharedSessionRecord,
} from "./domain/sharedSession/session.js";
export {
  sharedSessionAdmission,
  underlyingEditorSessionIdFor,
  openSharedSessionRecord,
  joinSharedSession,
  leaveSharedSession,
  closeSharedSessionRecord,
  requireLiveParticipant,
  sharedSessionLeaveSummary,
} from "./domain/sharedSession/session.js";

export type {
  SharedPresenceCapabilities,
  ParticipantPresence,
} from "./domain/sharedSession/presence.js";
export {
  joinPresence,
  heartbeatPresence,
  leavePresence,
  liveParticipantIds,
  findPresence,
} from "./domain/sharedSession/presence.js";

export type {
  SharedSessionEditDelta,
  OrderedSharedDelta,
  SharedSessionCoordination,
  SharedDeltaBroadcast,
} from "./domain/sharedSession/coordination.js";
export {
  initialSharedSessionCoordination,
  broadcastSharedDelta,
  advanceCoordinationHead,
  sharedSessionLogIsOrdered,
  validateSharedSessionReconcile,
} from "./domain/sharedSession/coordination.js";

export type {
  SharedSessionStorePort,
  SharedDeltaDelivery,
  SharedDeltaSinkPort,
  SharedSessionHistoryReadPort,
  OpenSharedSessionInput,
  JoinSharedSessionInput,
  LeaveSharedSessionInput,
  HeartbeatSharedSessionInput,
  BroadcastSharedDeltaInput,
  SharedDeltaBroadcastReceipt,
  SaveSharedSessionInput,
  SharedSessionSaveResult,
  CloseSharedSessionInput,
  SharedSessionCloseResult,
  SharedEditorSessionDeps,
} from "./domain/sharedSession/ports.js";

export { SharedEditorSessionService } from "./app/SharedEditorSessionService.js";

export { InMemorySharedSessionStore } from "./adapters/InMemorySharedSessionStore.js";
export { FsSharedSessionStore } from "./adapters/FsSharedSessionStore.js";

// ---------------------------------------------------------------------------
// Wave 6 (w6b) — round-trip expansions (integration level 2): the REAL
// Inkscape SVG, Godot .tscn and Audacity .aup adapters, following the
// KdenliveAdapter level-2 precedent. Additive-only re-exports; every
// Wave 1/3/4/6a signature above is untouched.
// ---------------------------------------------------------------------------

export { InkscapeAdapter } from "./adapters/InkscapeAdapter.js";
export { InkscapeSvgError, inkscapeLayersOf } from "./adapters/inkscapeSvg.js";
export type {
  InkscapeProjectState,
  InkscapeSvgDocument,
  InkscapeLayer,
  InkscapePath,
  InkscapeRawElement,
} from "./adapters/inkscapeSvg.js";

export { GodotTscnAdapter } from "./adapters/GodotTscnAdapter.js";
export { GodotTscnError } from "./adapters/godotTscnLiterals.js";
export type {
  GodotValue,
} from "./adapters/godotTscnLiterals.js";
export type {
  GodotTscnState,
  GodotSceneHeader,
  GodotSceneSection,
  GodotExtResource,
  GodotSubResource,
  GodotNodeSection,
  GodotOpaqueSection,
} from "./adapters/godotTscn.js";

export { AudacityAupAdapter } from "./adapters/AudacityAupAdapter.js";
export { AudacityAupError, audacityWavetracksOf } from "./adapters/audacityAup.js";
export type {
  AudacityProjectState,
  AudacityProject,
  AudacityProjectChild,
  AudacityTagsBlock,
  AudacityTag,
  AudacityWavetrack,
  AudacityWaveclip,
  AudacitySequence,
  AudacityWaveblock,
  AudacityBlockFile,
  AudacityRawElement,
} from "./adapters/audacityAup.js";

// ═══ w6c additions — ADDITIVE ONLY (all frozen names above must still export; surface check holds) ═══

// w6c-2: presence staleness policy
export type {
  StalenessClass,
  StalenessPolicy,
  StalenessRecord,
  StalenessDecision,
  StalenessSnapshot,
} from './domain/sharedSession/staleness/staleness.js';
export {
  classifyStaleness,
  stalenessSnapshot,
  validateStalenessPolicy,
  participantRecord,
  MISSING_HEARTBEAT_REASON,
  InvalidStalenessPolicyError,
} from './domain/sharedSession/staleness/staleness.js';

// w6c-3: rebase-on-conflict
export type {
  RebaseDeltaInput,
  RebaseLogEntry,
  RebasedDelta,
  RebaseOutcome,
  RebaseNotExpressibleReason,
  RebaseInvalidReason,
} from './domain/sharedSession/rebase/rebase.js';
export {
  rebaseDelta,
  RebaseNotExpressibleError,
  RebaseInvalidInputError,
} from './domain/sharedSession/rebase/rebase.js';

// w6c-1: stdlib WebSocket transport delta-sink + test client
export { WsSharedDeltaSink } from './adapters/wsSharedDeltaSink/wsSharedDeltaSink.js';
export type {
  WsSharedDeltaSinkOptions,
  WsDeliveryReceipt,
  WsDeliveryRecord,
} from './adapters/wsSharedDeltaSink/wsSharedDeltaSink.js';
export { connectWs } from './adapters/wsSharedDeltaSink/wsClient.js';
export type { WsTestClient, WsCloseInfo, ConnectWsOptions } from './adapters/wsSharedDeltaSink/wsClient.js';
