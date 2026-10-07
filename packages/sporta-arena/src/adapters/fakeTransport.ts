/**
 * In-memory FAKE Arena transport (adapters layer — fixture-grade).
 *
 * Simulates the Arena side of the escalation contract: it accepts an
 * escalation at `created`, advances the lifecycle step by step along
 * the legal chain, and produces a result with learningArtifactRefs when
 * the simulated expert submits. This is FIXTURE EVIDENCE by
 * construction — it stands in for the real Arena transport (HTTP,
 * Wave 2) and never claims real expert sessions.
 *
 * The produced result is deliberately `validated: false`: the Arena
 * side does not assert Sporta-side validation (architecture lock
 * invariant 16 — Arena results are validated by Sporta before
 * application).
 */
import { createHash } from "node:crypto";
import type { ArenaEscalationRecord, ArenaResultRecord, SportaId } from "@sporta/contracts/contract";
import type {
  ArenaTransportPort,
  ArenaTransportStatus,
  ArenaTransportSubmission,
} from "../app/arenaTransport.js";
import { nextEscalationLifecycleStep } from "../domain/escalation.js";
import { expectedResultTypes } from "../domain/resultValidation.js";

/** Constructor options of the fake transport. */
export interface InMemoryArenaTransportDeps {
  /** Injectable clock for result provenance capturedAt. */
  now?: () => string;
  /** Outcome the simulated Arena picks after `validating` (default accepted_result). */
  outcome?: "accepted_result" | "revision_required" | "rejected";
}

interface SimulationEntry {
  escalation: ArenaEscalationRecord;
  contextRefs: readonly SportaId[];
  result: ArenaResultRecord | null;
}

/** Fixture-grade in-memory Arena transport. */
export class InMemoryArenaTransport implements ArenaTransportPort {
  readonly #entries = new Map<SportaId, SimulationEntry>();
  readonly #submissions: ArenaTransportSubmission[] = [];
  readonly #now: () => string;
  readonly #outcome: NonNullable<InMemoryArenaTransportDeps["outcome"]>;

  constructor(deps: InMemoryArenaTransportDeps = {}) {
    this.#now = deps.now ?? (() => new Date().toISOString());
    this.#outcome = deps.outcome ?? "accepted_result";
  }

  async submit(submission: ArenaTransportSubmission): Promise<void> {
    const escalationId = submission.escalation.escalationId;
    if (this.#entries.has(escalationId)) {
      return; // idempotent submit: the escalation is already with the Arena
    }
    this.#submissions.push({
      escalation: { ...submission.escalation },
      contextRefs: [...submission.contextRefs],
    });
    this.#entries.set(escalationId, {
      escalation: { ...submission.escalation, lifecycle: "created" },
      contextRefs: [...submission.contextRefs],
      result: null,
    });
  }

  async status(escalationId: SportaId): Promise<ArenaTransportStatus | null> {
    const entry = this.#entries.get(escalationId);
    if (entry === undefined) {
      return null;
    }
    return { lifecycle: entry.escalation.lifecycle, result: entry.result };
  }

  /**
   * Simulation helper (not part of the transport port): advance the
   * simulated Arena `steps` lifecycle steps along the legal chain.
   * The result is produced when the lifecycle reaches `submitted`.
   * Saturates at `closed`; returns the reached lifecycle.
   */
  async advance(
    escalationId: SportaId,
    steps = 1,
  ): Promise<ArenaEscalationRecord["lifecycle"]> {
    const entry = this.#entries.get(escalationId);
    if (entry === undefined) {
      throw new Error(`fake transport: unknown escalation ${escalationId}`);
    }
    for (let step = 0; step < steps; step += 1) {
      const next = nextEscalationLifecycleStep(entry.escalation.lifecycle, this.#outcome);
      if (next === null) {
        break;
      }
      entry.escalation = { ...entry.escalation, lifecycle: next };
      if (next === "submitted" && entry.result === null) {
        entry.result = this.#produceResult(entry.escalation);
      }
    }
    return entry.escalation.lifecycle;
  }

  /** All submissions received so far (fixture assertions). */
  submissions(): readonly ArenaTransportSubmission[] {
    return this.#submissions;
  }

  #produceResult(escalation: ArenaEscalationRecord): ArenaResultRecord {
    const resultType = expectedResultTypes(escalation.sessionMode).at(0) ?? "solution";
    const payload = `fixture:arena-result:${escalation.escalationId}`;
    return {
      resultId: `res:${escalation.escalationId}`,
      escalationId: escalation.escalationId,
      resultType,
      payloadHash: createHash("sha256").update(payload).digest("hex"),
      validated: false,
      learningArtifactRefs: [`learn:arena:${escalation.escalationId}:1`],
      provenance: {
        sourceKind: "arena-session",
        sourceRef: escalation.escalationId,
        capturedAt: this.#now(),
      },
    };
  }
}
