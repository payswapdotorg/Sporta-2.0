/**
 * The Arena transport port (app layer).
 *
 * The typed interface for the real Arena transport (HTTP later). The
 * port is declared in the APP layer because the app service consumes
 * it; adapter implementations (the in-memory fake now, HTTP later)
 * import it from here — the architecture layer-direction law forbids
 * app -> adapters imports. The port is module-internal: it is NOT part
 * of the public contract (consumers depend on `ArenaClientPort` only).
 */
import type { ArenaEscalationRecord, ArenaResultRecord, SportaId } from "@sporta/contracts/contract";

/**
 * What the client submits to the Arena transport: the escalation record
 * plus EXACTLY the context refs the caller pre-filtered. The service
 * adds, infers or filters nothing (context minimization).
 */
export interface ArenaTransportSubmission {
  escalation: ArenaEscalationRecord;
  contextRefs: readonly SportaId[];
}

/** Transport-side view of one escalation. */
export interface ArenaTransportStatus {
  lifecycle: ArenaEscalationRecord["lifecycle"];
  result: ArenaResultRecord | null;
}

/** Port for the Arena transport. Implemented by the adapters layer. */
export interface ArenaTransportPort {
  /** Deliver one escalation (with its permitted context) to the Arena. */
  submit(submission: ArenaTransportSubmission): Promise<void>;
  /** Current Arena-side lifecycle and result for one escalation (null when unknown). */
  status(escalationId: SportaId): Promise<ArenaTransportStatus | null>;
}
