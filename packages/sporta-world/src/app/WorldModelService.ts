import type { PolicySet, SportsWorldModelRecord, SportaId } from "@sporta/contracts/contract";
import {
  InvalidObservationError,
  MixedDomainError,
  ProvenanceRefusalError,
  WorldModelError,
  WorldPolicyConflictError,
} from "../domain/errors.js";
import {
  computeSnapshotHash,
  defaultWorldPolicy,
  deriveObservationId,
  isIngestibleSourceKind,
  isValidConfidence,
  policiesEqual,
  sortedUniqueIds,
} from "../domain/snapshot.js";
import type {
  IngestedObservation,
  ObservationInput,
  WorldClock,
  WorldHashFn,
  WorldModelPort,
} from "../domain/ports.js";
/**
 * WorldModelService — the production SWM ingestion seam (fixture-grade).
 *
 * Sole owner of snapshot records, the observation ledger and established
 * policies. Batches are validated all-or-nothing; only authorized-source
 * and observation provenance enters production truth (see SPEC.md).
 */
export class WorldModelService implements WorldModelPort {
  private readonly clock: WorldClock;
  private readonly hash: WorldHashFn;
  private readonly snapshots = new Map<SportaId, SportsWorldModelRecord>();
  private readonly ledger = new Map<SportaId, IngestedObservation[]>();
  private readonly observationOwner = new Map<SportaId, SportaId>();
  private readonly policies = new Map<SportaId, PolicySet>();

  constructor(clock: WorldClock, hash: WorldHashFn) {
    this.clock = clock;
    this.hash = hash;
  }

  async ingestObservations(input: readonly ObservationInput[]): Promise<SportsWorldModelRecord> {
    const first = input[0];
    if (first === undefined) {
      throw new WorldModelError("observation batch is empty", "empty-batch");
    }
    const domain = first.domain;
    const explicitPolicies: PolicySet[] = [];

    // Batch validation (all-or-nothing) — nothing is ingested on refusal.
    for (const observation of input) {
      const sourceKind = observation.provenance.sourceKind;
      if (!isIngestibleSourceKind(sourceKind)) {
        throw new ProvenanceRefusalError(
          `observation provenance sourceKind "${sourceKind}" may not enter production SWM truth`,
          `source-kind:${sourceKind}`,
        );
      }
      if (observation.domain !== domain) {
        throw new MixedDomainError(
          `observation batch mixes domains "${domain}" and "${observation.domain}"`,
          `${domain}|${observation.domain}`,
        );
      }
      if (!isValidConfidence(observation.confidence)) {
        throw new InvalidObservationError(
          `observation confidence ${observation.confidence} is outside [0, 1]`,
          `confidence:${observation.confidence}`,
        );
      }
      if (observation.policy !== undefined) explicitPolicies.push(observation.policy);
    }
    const batchPolicy = explicitPolicies[0];
    if (batchPolicy !== undefined) {
      for (const policy of explicitPolicies) {
        if (!policiesEqual(policy, batchPolicy)) {
          throw new WorldPolicyConflictError(
            "observations in one batch declare conflicting policies",
            "batch",
          );
        }
      }
    }

    const swmId = `swm:${domain}`;
    const existing = this.snapshots.get(swmId);
    const established = this.policies.get(swmId);
    if (existing !== undefined && batchPolicy !== undefined && established !== undefined) {
      if (!policiesEqual(established, batchPolicy)) {
        throw new WorldPolicyConflictError(
          "the batch policy conflicts with the snapshot's established policy",
          `swm:${swmId}`,
        );
      }
    }

    // Deduplicated, idempotent append (first write wins per observationId).
    const observations = this.ledger.get(swmId) ?? [];
    const newObservations: IngestedObservation[] = [];
    for (const observation of input) {
      const observationId = deriveObservationId(observation, this.hash);
      if (this.observationOwner.has(observationId)) continue; // already ingested
      this.observationOwner.set(observationId, swmId);
      const entry: IngestedObservation = {
        observationId,
        swmId,
        domain,
        payloadHash: observation.payloadHash,
        capturedAt: observation.capturedAt,
        confidence: observation.confidence,
        provenance: observation.provenance,
        entityRefs: observation.entityRefs ?? [],
        eventRefs: observation.eventRefs ?? [],
        ingestedAt: this.clock.now(),
      };
      observations.push(entry);
      newObservations.push(entry);
    }
    if (newObservations.length === 0) {
      // Pure retry: return the existing snapshot unchanged.
      if (existing === undefined) throw new WorldModelError("unreachable", "internal");
      return existing;
    }
    this.ledger.set(swmId, observations);

    const policy = established ?? batchPolicy ?? defaultWorldPolicy();
    this.policies.set(swmId, policy);
    const last = newObservations[newObservations.length - 1];
    if (last === undefined) throw new WorldModelError("unreachable", "internal");
    const record: SportsWorldModelRecord = {
      swmId,
      domain,
      snapshotHash: computeSnapshotHash(
        observations.map((entry) => entry.payloadHash),
        this.hash,
      ),
      entities: sortedUniqueIds(observations.flatMap((entry) => [...entry.entityRefs])),
      events: sortedUniqueIds(observations.flatMap((entry) => [...entry.eventRefs])),
      uncertainty: observations.map((entry) => ({
        subject: entry.observationId,
        confidence: entry.confidence,
      })),
      provenance: last.provenance,
      policy,
    };
    this.snapshots.set(swmId, record);
    return record;
  }

  async readSnapshot(swmId: SportaId): Promise<SportsWorldModelRecord | null> {
    return this.snapshots.get(swmId) ?? null;
  }

  /** Additive accessor: the per-observation provenance ledger of a snapshot. */
  readObservations(swmId: SportaId): readonly IngestedObservation[] {
    return this.ledger.get(swmId) ?? [];
  }
}
