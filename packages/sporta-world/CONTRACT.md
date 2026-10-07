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
