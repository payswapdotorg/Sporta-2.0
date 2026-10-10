# sporta-world SPEC (Wave 1, Worker B — work order B5; Wave 5 pipeline: Worker A, w5a)

Status: SPEC — written before implementation (both waves).

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

---

# Wave 5 — perception pipeline SPEC (Worker A, w5a)

Status: SPEC — written before implementation (this section).

Authority: docs/architecture/adr-wave5-p6-sports-production.md
Decision 1; docs/contracts/sports-world-model.md (the pipeline:
`authorized source -> acquisition -> normalization -> perception ->
tracking -> calibration -> event reconstruction -> SWM`). The Wave 1
ingestion seam (`snapshot.ts` / `ports.ts` / `WorldModelService`) is
FROZEN — this wave is purely additive in a NEW
`src/domain/pipeline/` surface; zero edits to the seam's signatures.

## Honesty statement (NO ML — read first)

The perception stage is an HONEST TYPED TRANSFORM: deterministic
rule-based perception over normalized observations. NO machine-learning
model is loaded, executed or claimed anywhere in this package — no
weights, no inference runtime, no trained parameters. Every perceived
fact is produced by a DECLARED rule (a typed field-mapping the caller
supplies) applied deterministically to an observation payload. Where a
rule does not match, nothing is perceived; where identity or continuity
cannot be established by DECLARED keys, nothing is guessed (gaps are
recorded, never interpolated). The SPEC, code, tests and reports say
exactly this and nothing stronger.

## Stage laws (every stage, no exceptions)

- Pure domain functions (no IO, no timers, no network — the
  architecture checker's domain-io rule); the sha-256 helper stays
  injected (`WorldHashFn`, adapters-owned) exactly like Wave 1.
- Typed input records, typed output records, typed errors (all extend
  the existing `WorldModelError` with machine-readable `detail`).
- Deterministic and idempotent per batch: the same batch yields the
  same outputs (identical ids, identical ordering); re-running a stage
  on the same input changes nothing. Deterministic ids are derived
  from stage inputs, never from ambient state or insertion order.
- Provenance carried: every output record cites the authorized-source
  acquisition chain(s) it derives from (`acquisitionIds`, sorted
  unique) plus its immediate input records (observation ids, fact ids).
- Uncertainty carried: confidence is NEVER raised by any stage. A
  stage may only carry a confidence verbatim or LOWER it by applying a
  DECLARED ceiling/factor with `min`. No stage invents a confidence
  for a record that had none — raw observations must declare
  confidence (refusal otherwise).
- Fail-closed: a stage refuses (typed error) when it cannot affirm a
  precondition — unauthorized source kinds, missing rights scope,
  observations citing unknown media, declared rules that match a
  payload field with the wrong type, malformed parameters. A refusal
  names the offending record.
- Empty input batches are total: every stage maps an empty input array
  to an empty output array (deterministic). The COMPOSITION (below)
  refuses the caller errors (empty raws/manifest) itself — mirroring
  the seam's empty-batch refusal with zero side effects.

## Stage 1 — acquisition (`pipeline/acquisition.ts`)

`acquireSources(manifests) -> AcquisitionRecord[]`

- Input: `AcquisitionManifest` — an authorized source declaration:
  `manifestId`, `domain`, `provenanceSeed` (a `ProvenanceDescriptor`),
  `mediaRefs` (typed media references: id, free-form kind vocabulary,
  capturedAt), `policy` (a `PolicySet` whose rights scope authorizes
  the acquisition) and an optional `sourceConfidenceCeiling`.
- Source-kind gate (fail-closed, earliest stage): the seed's
  `sourceKind` must be `"authorized-source"` or `"observation"` (the
  same ingestible vocabulary the Wave 1 seam enforces — mirrored, not
  invented). Anything else is a typed `AcquisitionProvenanceError`
  naming the kind. A missing/invalid seed confidence is the same
  refusal class.
- Rights gate (fail-closed): a manifest whose `policy.rights` is
  absent at runtime, or whose `rights.usages` declares no usage class,
  is a typed `AcquisitionRightsError` — a scope that cannot affirm ANY
  usage authorizes nothing (mirroring the W3-B/W4-B empty-usage
  fail-closed law). Holders are carried, never evaluated (same
  doctrine as the artifact/editor planes — holder-bound authorization
  is a policy-domain concern above this package).
- A manifest must declare at least one media ref and non-empty
  `manifestId`/`domain`/`sourceRef`; media ids must be unique within
  the manifest; a batch must not repeat a `manifestId`; all manifests
  in one batch must declare the same `domain` (mirroring the seam's
  mixed-domain law).
- Output: `AcquisitionRecord` — the authorized chain root
  (`AcquisitionChain`: acquisitionId, domain, narrowed source kind,
  sourceRef), the validated media refs, the declared policy and the
  effective source confidence ceiling (declared or 1.0 =
  carry-only). The ceiling is applied DOWNSTREAM by min (never raises).

## Stage 2 — normalization (`pipeline/normalization.ts`)

`normalizeObservations(acquisition, raws, seams) -> NormalizedObservation[]`

- Input: one `AcquisitionRecord` plus `RawObservation`s (per-domain):
  `rawId`, `mediaRef` (the acquisition media it came from),
  `capturedAt`, `confidence` (REQUIRED — never invented downstream),
  a structured `payload` (`Record<string, unknown>`), optional
  entity/event refs.
- Validation (typed `NormalizationError`, fail-closed): non-empty
  raws; unique `rawId`s; `mediaRef` must belong to the acquisition
  (an observation citing unknown/unauthorized media cannot enter the
  chain); `capturedAt` must parse as ISO-8601 (the timestamp domain is
  this stage's responsibility — tracking sorts on it); confidence in
  [0, 1]; payload must be a plain object.
- Canonical payload hashing: `payloadHash` = injected
  sha-256(`canonicalJson(payload)`) where `canonicalJson` recursively
  sorts object keys (arrays keep their order — arrays are ordered
  facts). Deterministic across runs and key-insertion orders.
- The output wraps THE EXACT `ObservationInput` vocabulary
  `ingestObservations` already accepts (zero seam edits): domain,
  payloadHash, capturedAt, confidence (min with the source ceiling —
  carry or lower), provenance MINTED from the acquisition's validated
  chain (sourceKind/sourceRef carried from the authorized source,
  capturedAt and confidence from the raw observation), optional
  entity/event refs, and the manifest's `policy` (declared rights
  become the snapshot's established policy — never invented).
- `observationId` is derived with the SEAM's own pure function
  (`deriveObservationId` — identical to what ingestion would derive
  when absent), so natural retries are idempotent at the seam and
  downstream stages cite stable ids.
- Each `NormalizedObservation` also carries the pipeline-only
  citation fields (never passed to the seam): the full chain, the
  media ref, and the raw payload for downstream perception.

## Stage 3 — perception (`pipeline/perception.ts`)

`perceiveObservations(normalized, rules) -> PerceivedFact[]`

- HONEST typed transform (see the honesty statement): declared rules
  extract typed entity/ball state facts from normalized payloads.
  Rule vocabulary: `entity-state` and `ball-state` rules, each a
  DECLARED field map — which payload field holds the entity/ball id,
  which fields hold x/y(/z) coordinates, an optional possession field,
  and an optional `confidenceFactor` (a declared ceiling in [0, 1],
  applied by min).
- Rule application law (fail-closed, never guessing): a rule APPLIES
  to an observation only when ALL its mapped fields are present in the
  payload; a mapped field present with the WRONG TYPE (id/possession
  not a non-empty string, coordinate not a finite number) is a typed
  `PerceptionError` naming the rule and the field (a declared rule
  hitting mistyped data is a misconfiguration, not a skip). Rules that
  do not match an observation produce nothing for it — absence is
  never a fact.
- Facts: `factId` (deterministic: rule + observation + entity), the
  rule id, the kind, `observationId` (provenance ref to the source
  observation), `mediaRef`, the entity id, the extracted position, an
  optional carried possession, `capturedAt`, and confidence =
  min(observation confidence, rule factor) — carry or lower only.
- Facts are deduplicated by `factId` and sorted by `factId` (the
  batch's output order is independent of the input order).
- Mixed domains in one perception batch are refused (typed); rule ids
  must be unique and non-empty; factors must be valid confidences.

## Stage 4 — tracking (`pipeline/tracking.ts`)

`trackEntities(facts, params) -> EntityTrack[]`

- Identity association by DECLARED keys ONLY: facts are grouped by
  (entityId, kind) — the identity key the perception rule declared.
  Positional proximity is NEVER used to associate identity (that
  would be guessing).
- `TrackingParams` (declared, required): `maxGapMs` (a positive finite
  continuity budget in milliseconds) and an optional
  `gapConfidenceCeiling` (a declared confidence ceiling applied to
  tracks whose continuity broke — by min, carry or lower).
- States are deduplicated by factId and ordered by capturedAt (ties
  broken by factId — deterministic); timestamps were validated at
  normalization.
- Continuity gaps: consecutive states further apart than `maxGapMs`
  produce a typed `TrackGap` record (from/to capturedAt, gapMs). A
  gap is RECORDED, never interpolated — no state is invented between
  observations. A track's confidence is min over its member states,
  further min'd with the gap ceiling when gaps exist (never raised).
- Tracks carry `trackId` (deterministic: kind + entityId), the
  entityId, the kind, the ordered `TrackedState`s (each citing
  factId + observationId + confidence), the gaps, the confidence and
  `acquisitionIds` (sorted unique chain citations). Tracks are sorted
  by trackId.

## Stage 5 — calibration (`pipeline/calibration.ts`)

`calibrateTracks(tracks, params) -> CalibratedTrack[]`

- Typed parameters in, typed corrections out: `TimingCalibration`
  (declared clock offsets per media ref, in ms) and/or
  `CameraCalibration` (declared per-media axis-aligned transforms:
  optional per-axis scale and translation). Both stages are optional;
  when a stage's params are absent its dimension carries unchanged.
- Fail-closed: every media ref cited by the input tracks' facts MUST
  have a declared timing offset (when timing calibration is active)
  and a declared camera transform (when camera calibration is active)
  — an undeclared media ref means the alignment cannot be affirmed.
  Offsets must be finite; scales must be finite and non-zero;
  translations finite; optional confidence ceilings must be valid
  confidences. Violations are typed `CalibrationError`s.
- Corrections are exact deterministic arithmetic: corrected timestamp
  = source timestamp + the state's media offset (re-serialized
  ISO-8601); corrected position = position * scale + translation per
  axis (z only when declared/present). Gap records carry with their
  bounding states' corrected timestamps and the gap duration is
  recomputed from the corrected endpoints (the gap PAIRING was
  decided at tracking on source timestamps; calibration corrects the
  measurement, not the detection — documented law).
- Confidence: each corrected state's confidence is min(state
  confidence, active stages' declared ceilings); the track confidence
  is min(input track confidence, active ceilings) — carry or lower
  only. Calibration never raises confidence and never drops it.

## Stage 6 — event reconstruction (`pipeline/eventReconstruction.ts`)

`reconstructEvents(tracks, rules, domain) -> ReconstructedEvent[]`

- Declared rule vocabulary (the contract's event/possession domains,
  typed small): `zone-entry` (an entity's calibrated track crosses a
  declared axis-aligned ground-plane zone boundary — finite bounds,
  min < max, a declared zone id, a declared non-empty watched-entity
  list) and `possession-change` (a declared ball entity's calibrated
  track changes possession between consecutive states).
- Detection laws (never guessing): a zone-entry event fires only on a
  consecutive state pair (outside -> inside) — a first state already
  inside a zone emits NOTHING (the entry was not observed); a
  possession-change fires only between consecutive states whose
  declared possessions differ (a change to/from an absent possession
  field is carried honestly as a from/to-less change; equal or both-
  absent possessions emit nothing).
- Every `ReconstructedEvent` carries per-event provenance refs to its
  SOURCE OBSERVATIONS (`sourceObservationIds`, sorted unique) and
  source facts (`sourceFactIds`), the acquisition chains, the rule id,
  the calibrated event timestamp, the entity id, a typed detail record
  (zone id / possession from-to) and confidence = min over its source
  states (carry or lower only).
- `eventId` is deterministic (kind + rule + entity + triggering state
  observation); events are deduplicated by id and sorted by id.
  Rules are validated (typed `EventReconstructionError`): unique
  non-empty rule ids, finite zone bounds with min < max, non-empty
  watched entities, a declared ball entity.

## Composition (W5A-2, `pipeline/composition.ts`)

`planPipelineObservations(plan, seams) -> PipelineResult` — PURE
evaluation of the whole chain (manifest -> acquisition ->
normalization -> perception -> tracking -> calibration -> event
reconstruction). `runPipeline(world, plan, seams)` then calls the
EXISTING `WorldModelPort.ingestObservations` boundary with the
planned observations and returns the `SportsWorldModelRecord`.

- All-or-nothing is STRUCTURAL: every stage is pure, so a failure at
  ANY stage throws before `ingestObservations` is ever called — zero
  ingestion side effects. No partial-acceptance path exists.
- The observations fed to the seam: every normalized observation (the
  exact seam vocabulary, including the manifest's declared policy) and
  one observation per reconstructed event (deterministic
  `obs:<eventId>` id, payloadHash over the canonical event detail
  INCLUDING its source observation ids, the event's timestamp and
  min-carried confidence, provenance minted from the authorized chain,
  `eventRefs: [eventId]`, `entityRefs` when the event names an
  entity, the same declared policy). Event observations therefore
  re-ingest idempotently on pipeline retries (same event ids).
- Composition-level fail-closed refusals (typed
  `PipelineCompositionError`): a missing manifest, an empty raw
  observation batch (mirrors the seam's own empty-batch refusal),
  and any stage's typed error propagates unchanged.
- The plan's `tracking` params are REQUIRED (the continuity budget is
  part of the pipeline's declared law — validated even when
  perception produces no facts); `perceptionRules`, `calibration` and
  `eventRules` are optional (absent = that stage contributes nothing;
  the run ingests normalized observations only).
- `PipelineResult` carries every stage's typed records (acquisition,
  normalized, facts, tracks, calibrated tracks, events) plus the
  planned observations — tests and callers can audit the chain; the
  seam receives only what its frozen vocabulary accepts.

## Domain extension law (ADR Decision 4)

A new sport or NON-SPORT event domain is ADDITIVE DATA: a new domain
tag plus domain-specific rules/validation data behind the SAME stage
seams (the same functions, the same types). No WorkGraph or
Organizations redesign, no new code path per domain. REQUIRED
invariant test: one full end-to-end run with a SECOND synthetic
domain (not the primary fixture domain) through the same composition
function, landing an independent `swm:<domain>` snapshot. The
pipeline never hard-codes a sport: the only sport-specific vocabulary
lives in caller-declared rules, zones, field maps and payloads.

## Evidence grading

Stage inputs in tests are fixture-grade (labeled in test headers
exactly like the a17 reference). The pure functions themselves run
for real — real deterministic outputs on real inputs, real wall-time
— but NO real media, NO real perception provider and NO model are
involved or claimed. The honest claim of this wave: the pipeline's
LAWS (typing, provenance carry, confidence carry-or-lower,
idempotency, fail-closed refusals, domain additivity) are proven
end-to-end at fixture grade.

## Failure semantics (pipeline additions)

| Failure                                            | Typed error                  |
| -------------------------------------------------- | ---------------------------- |
| Non-authorized acquisition source kind / seed       | `AcquisitionProvenanceError` |
| Missing or empty rights scope                      | `AcquisitionRightsError`     |
| Bad raw observation (unknown media, bad timestamp…) | `NormalizationError`         |
| Declared rule misconfiguration / mistyped field     | `PerceptionError`            |
| Bad tracking params (maxGapMs…)                    | `TrackingError`              |
| Undeclared media / malformed calibration params    | `CalibrationError`           |
| Bad event rules (zone bounds, entities…)           | `EventReconstructionError`   |
| Composition caller errors (empty raws…)            | `PipelineCompositionError`   |

All extend `WorldModelError` with machine-readable `detail`; all are
exported additively from the single public entrypoint
(`src/contract.ts`), which keeps the frozen Wave 1 surface intact
(additive-only growth, surface-check law).

## File-size law

One file per stage plus `provenance.ts` (shared chain types), `errors.ts`
(typed pipeline errors) and `composition.ts`; every file stays under
400 lines (split further if any stage grows past the law).
