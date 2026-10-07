# sporta-world SPEC (Wave 1, Worker B — work order B5)

Status: SPEC — written before implementation.

## Scope

Production Sports World Model seams: ingestion of normalized observations
into evidence-backed SWM snapshots with provenance, confidence and
uncertainty. This is the production-truth seam — the SWM pipeline stages
(acquisition, perception, tracking, calibration, event reconstruction) are
Wave 2+; Wave 1 implements the ingestion boundary and snapshot semantics.

Fixture-grade: in-memory snapshots and observation ledger, injectable clock
and hash. No perception, no renderers.

## Behavior

### ingestObservations(input) -> SportsWorldModelRecord

- Ingestion is ALL-OR-NOTHING per call: if any observation is invalid, the
  whole batch is refused and NOTHING is ingested (no partial acceptance).
- Provenance gate (SWM production-truth invariant): only
  `sourceKind: "authorized-source"` or `"observation"` may enter ingestion.
  Anything else (e.g. `arena-session`, `agent-run`, `measurement`) is
  refused with a typed `ProvenanceRefusalError` naming the offending
  observation.
- Domain consistency: every observation in one call must declare the same
  `domain`, else `MixedDomainError` (one snapshot models one event domain).
- Confidence must lie in [0, 1], else `InvalidObservationError`.
- Policy consistency: explicit `policy` values inside a batch must agree;
  a later batch whose explicit policy differs from the snapshot's
  established policy is refused (`WorldPolicyConflictError`) — rights are
  never silently weakened by a later ingest. Batches without an explicit
  policy inherit the snapshot's established policy (or the fixture default
  for a new snapshot).
- Idempotency per `observationId`: re-ingesting known observations is a
  no-op for those entries (the snapshot hash is unchanged; duplicates
  within one batch are deduplicated). When `observationId` is absent a
  deterministic id is derived from
  `sha-256(domain, payloadHash, sourceRef, capturedAt)` so natural retries
  stay idempotent.
- Snapshot identity: `swmId` is derived from the domain (`swm:<domain>`) —
  the fixture-grade single-snapshot-per-domain semantics; event-instance
  scoping arrives with a future additive input (see NEXT DEPENDENCIES in
  the worker report).
- Snapshot content:
  - `snapshotHash` = sha-256 over the sorted payload hashes of ALL
    ingested observations (a pure domain function; the sha-256 helper
    itself lives in adapters and is injected);
  - `entities`/`events` = sorted unique union of the observations'
    optional `entityRefs`/`eventRefs`;
  - `uncertainty` = one entry per ingested observation
    `{ subject: observationId, confidence }` — uncertainty is carried,
    never dropped;
  - `provenance` = the provenance of the last observation in the batch
    (the freshest source), while the full per-observation provenance
    ledger is retained and readable via `readObservations(swmId)`;
  - `policy` = the snapshot's established policy.

### readSnapshot(swmId) -> SportsWorldModelRecord | null

- Returns the snapshot by id; `null` for an unknown id.

### readObservations(swmId) (additive service method)

- Returns the per-observation provenance ledger for a snapshot (every
  observation with its original provenance, confidence and payload hash).

## Single state owner

`WorldModelService` (app layer) solely owns the in-memory snapshot records,
the observation ledger and the established policies. External tools may
PROPOSE observations but never mutate canonical SWM — there is no other
write path.

## Invariants

1. Production SWM is evidence-backed: every snapshot is derived only from
   ingested observations that carry provenance.
2. Only authorized/observation provenance enters production truth; lab
   simulation and arena guesses are refused at the boundary.
3. Uncertainty (confidence) is carried on every observation, never dropped.
4. Observations retain their original provenance in the ledger.
5. Domain layer is pure; sha-256 helpers live in adapters (injectable).
6. Idempotent ingestion per observationId; retries never duplicate
   observations or change the snapshot hash.

## Failure semantics

| Failure                                          | Typed error                |
| ------------------------------------------------ | -------------------------- |
| Non-ingestible provenance source kind            | `ProvenanceRefusalError`   |
| Mixed domains in one batch                       | `MixedDomainError`         |
| Confidence outside [0, 1]                        | `InvalidObservationError`  |
| Policy conflict with established snapshot policy | `WorldPolicyConflictError` |
| Empty observation batch                          | `WorldModelError`          |

All errors extend `WorldModelError` with a machine-readable `detail`.

## Event order (ingestObservations)

1. batch-level validation (non-empty, provenance gate, domain consistency,
   confidence bounds, policy consistency);
2. deterministic observation id derivation;
3. deduplication against the existing ledger;
4. append new observations to the ledger;
5. recompute snapshot hash over ALL payload hashes (sorted);
6. rebuild entities/events/uncertainty from the full ledger;
7. store and return the snapshot.

Validation precedes mutation; a refused batch leaves no trace.
