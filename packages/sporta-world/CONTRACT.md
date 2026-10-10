# sporta-world

Production Sports World Model seams.

Invariants that types cannot express:

- Only authorized sources enter the pipeline.
- Production SWM snapshots are evidence-backed with provenance and confidence; uncertainty is carried, never dropped.
- Lab simulations and external model guesses never become production facts.
- Renderers consume SWM through adapters, never by mutating it.
- Additional sports and non-sport event domains require no WorkGraph/Organization redesign.

## Wave 1 implementation notes

- Ingestion is all-or-nothing per call: a refused batch leaves no trace.
- Only "authorized-source" and "observation" provenance enters production
  truth; everything else (arena-session, agent-run, measurement, ...) is
  a typed ProvenanceRefusalError.
- snapshotHash = sha-256 over the sorted payload hashes of ALL ingested
  observations (duplicates preserved — two observations are two facts).
- The snapshot's provenance is the freshest ingested observation's; the
  full per-observation provenance ledger is preserved and readable.
- swmId is derived per domain (`swm:<domain>`) — fixture-grade
  single-snapshot-per-domain semantics; event-instance scoping is a
  declared Wave 2 dependency.

## Wave 5 pipeline notes (w5a — additive)

- The pipeline stages (acquisition -> normalization -> perception ->
  tracking -> calibration -> event reconstruction) are PURE domain
  functions in `src/domain/pipeline/`; the Wave 1 ingestion seam is
  unchanged (frozen) and remains the only write path into the SWM.
- The perception stage is an HONEST TYPED TRANSFORM: deterministic
  rule-based extraction over normalized payloads. NO ML model is
  loaded, executed or claimed.
- Confidence is never raised by any stage: every stage carries or
  lowers (declared ceilings applied by min). Provenance is carried:
  every stage output cites the authorized acquisition chain(s) it
  derives from; reconstructed events cite their source observations.
- Acquisition fails closed: only "authorized-source"/"observation"
  seeds enter, and a rights scope that affirms no usage authorizes
  nothing (`AcquisitionRightsError`).
- Identity association is by DECLARED keys only (never positional
  guessing); continuity gaps are recorded, never interpolated.
- A failure at ANY stage produces zero ingestion side effects
  (structural: the composition is pure before the seam call).
- A new sport or non-sport domain is ADDITIVE DATA behind the same
  stage seams (domain-extension law, ADR wave-5 Decision 4) — no
  WorkGraph/Organizations redesign.
