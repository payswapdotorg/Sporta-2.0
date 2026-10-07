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
