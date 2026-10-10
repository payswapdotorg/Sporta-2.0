/**
 * sporta-arena — CapabilityGap intake and the Arena client boundary.
 *
 * Arena owns human expert sessions; Sporta stays authoritative over its
 * own state. Arena never directly mutates Sporta canonical state; results
 * are validated before application (invariants 14/15).
 */
export type {
  ArenaEscalationRecord,
  ArenaResultRecord,
  CapabilityGapRecord,
} from "@sporta/contracts/contract";

export type {
  RecordCapabilityGapInput,
  EscalateInput,
  ValidationVerdict,
  ArenaClientPort,
} from "./domain/clientPorts.js";

/** Typed error taxonomy of this module (domain errors re-exported additively). */
export {
  ArenaError,
  GapConflictError,
  UnknownGapError,
  EscalationConflictError,
  EscalationPolicyError,
  IllegalGapTransitionError,
  IllegalEscalationTransitionError,
  ArenaReadRefusalError,
} from "./domain/errors.js";

/** Capability-gap lifecycle state (open -> escalated -> resolved/closed). */
export type { GapStatus } from "./domain/gap.js";

/** Arena escalation lifecycle state and outcome (contract chain). */
export type { EscalationLifecycle, EscalationOutcome } from "./domain/escalation.js";

/** Session-mode and result-type views used by validation. */
export type { SessionMode, ArenaResultType } from "./domain/resultValidation.js";

// Composition-root exports (added by the TL at wave-1 integration so the
// seeded A17 proof and the product shell can construct the client through
// the public entrypoint like every sibling module):
export { ArenaClientService } from "./app/arenaClient.js";
export type { ArenaClientServiceDeps } from "./app/arenaClient.js";
export type {
  ArenaTransportPort,
  ArenaTransportSubmission,
  ArenaTransportStatus,
} from "./app/arenaTransport.js";
export { InMemoryArenaTransport } from "./adapters/fakeTransport.js";
export type { InMemoryArenaTransportDeps } from "./adapters/fakeTransport.js";

// Wave-3 additive (ADR: docs/architecture/adr-wave3-read-seams.md): the
// escalation read seam. `ArenaClientService` implements `EscalationReadPort`
// additively (listEscalations/listResults — bounded, read-only, summaries
// field-for-field with the canonical records). The port shapes are the
// frozen contracts types; nothing here mutates state.
export type {
  EscalationReadPort,
  EscalationSummary,
  EscalationResultSummary,
  EscalationQuery,
  EscalationResultQuery,
} from "@sporta/contracts/contract";

// Wave-4 W4C-2 additive (ADR: docs/architecture/adr-wave4-c6-host.md,
// invariant 22 — C6 rights propagation on the read plane): the caller
// usage context, the pure visibility gate (mirroring the W3-B editors'
// `sessionVisibleToUsage`), and the additive list-input extensions the
// gated seam reads accept. A bare contracts query remains valid input —
// absent usage context ⇒ the pre-wave-4 behavior (additive-only law).
export type {
  ArenaReadUsageContext,
  EscalationListInput,
  EscalationResultListInput,
} from "./domain/escalationReadSeam.js";
export {
  arenaRecordVisibleToUsage,
  arenaPolicyPermitsUsage,
} from "./domain/escalationReadSeam.js";

// Wave-3 additive (the W2 note): the REAL HTTP Arena transport re-exported
// through the public entrypoint — it was deep-importable only. Wire it into
// `ArenaClientServiceDeps.transport`; `ArenaTransportError` is its public
// error taxonomy (network/http/validation/timeout codes).
export { HttpArenaTransport, ArenaTransportError } from "./adapters/httpArenaTransport.js";
export type { HttpArenaTransportDeps } from "./adapters/httpArenaTransport.js";
