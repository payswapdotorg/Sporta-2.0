# ADR — Wave 5: P6 sports production (perception pipeline, renderer realities, playback — TL-serialized)

Date: 2026-10-10. Status: accepted (TL-only serialization; workers implement
behind their own entrypoints). Author: TL. Base: wave-4 integrated head
`51d0f6e` (w4a + w4b landed; w4c host-conversion lane in flight — see
integration log W4-A/W4-B).

## Context

Wave 4 landed the W2 flake fix, the organization rejection/rollback decision
path, and the C6 artifact-plane rights gate + editor write-plane audit
(318/318 TL-measured @ `d6e9aec` + records @ `51d0f6e`). The w4c lane
(projection candidate-read wiring + C6 arena read gate + packages/web host
conversion) is in flight. The roadmap frontier after wave 4 is **P6 —
sports production**: `authorized media -> perception -> SWM ->
tactical/3D/anime and additional realities -> playback`, closing acceptance
gate **A13** ("authorized sports source -> SWM -> two materially different
realities").

What exists today: `sporta-world` implements the SWM INGESTION boundary only
(work order B5, wave 1): `ingestObservations` — all-or-nothing batch
ingestion of normalized observations into evidence-backed `SportsWorldModelRecord`
snapshots with provenance/confidence/uncertainty gates. The pipeline stages
upstream of ingestion (acquisition, normalization, perception, tracking,
calibration, event reconstruction — the sports-world-model contract's
pipeline) are UNIMPLEMENTED. No renderer adapter boundary exists. No
playback. The SWM contract invariants that govern this wave:
- Production SWM is evidence-backed; lab simulation never becomes production
  truth; observations retain provenance; uncertainty is carried;
- **Renderers consume SWM through adapters**; external tools may propose
  observations but never silently mutate canonical SWM;
- Additional sports / non-sport event domains must be possible without
  redesigning WorkGraph or Organizations.

## Decision

1. **Perception pipeline stages (worker A, `sporta-world`, additive).** The
   contract's pipeline stages land as pure domain functions in a NEW
   `src/domain/pipeline/` surface (acquisition manifest -> normalized
   observations -> perception -> tracking -> calibration -> event
   reconstruction), each stage: typed input/output records, typed errors,
   idempotent per stage-batch, provenance-carrying (every stage output
   retains the authorized-source provenance chain of its inputs),
   uncertainty propagated (confidence never invented — a stage may only
   lower or carry, never raise). The final stage's output feeds the EXISTING
   `ingestObservations` boundary unchanged (no edit to the ingestion seam).
   Evidence law: fixture-grade stage inputs are labeled fixture-grade in
   test headers exactly like the a17 reference; REAL evidence only where
   actually real (pure functions run for real — real wall-time, real
   deterministic outputs on real inputs). NO ML claims: no model is loaded
   or executed in this sandbox; the perception stage is an honest
   typed transform (deterministic rule-based perception over normalized
   observations), documented as such in SPEC before code.
2. **Renderer adapters + two materially different realities (worker B, NEW
   `packages/sporta-render` module + additive seams).** The renderer
   boundary follows the SWM invariant: renderers NEVER consume
   `SportsWorldModelRecord` directly — they consume it through a per-renderer
   ADAPTER (a pure projection `SwmRenderModel` derived per reality kind).
   Two materially different realities, both consuming the SAME snapshot
   through their adapters: (i) **tactical board reality** — an event-faithful
   2D tactical projection (positions/events timeline derivable to a
   structured board state + event list, deterministic, data-class output:
   an SVG document or structured board record — the reality is the
   RENDER MODEL + serializer, honest about not being pixels); (ii)
   **play-by-play reality** — a materially different textual/sequential
   narrative projection (event-anchored commentary records with timestamps,
   strictly derived from SWM events, zero invented facts — every phrase
   traceable to an event id). Ownership: new `sporta-render` package per the
   WO-C1 module-creation law (SPEC/CONTRACT before code; registration in
   architecture-policy.yaml + dependency edges are TL-owned, landed at
   integration). Workers never touch root manifests or the lockfile.
3. **Playback (worker C, `sporta-render` additive + product seam).** A
   playback controller over the renderer render models: time-sequenced
   event replay (event timeline from the SWM snapshot -> per-tick render
   frames for each reality kind, deterministic seek/step/play semantics,
   typed playback errors, bounded buffers). The playback engine is
   headless-testable (node:test + tsx — the repo law) and consumes ONLY
   render models (never the SWM directly — the adapter invariant holds at
   playback too). The product host wiring (the realities surfacing inside
   the packages/web sporta shell) lands at INTEGRATION time by the TL
   behind the w4c host-conversion surface (transitional-symlink law WO-C1:
   gitignored symlinks during worker development; real dependency edges +
   policy registration are TL-serialization).
4. **Domain extension law.** The pipeline + realities stay domain-generic:
   a new sport (or non-sport event domain) is ADDITIVE data (a new domain
   tag + domain-specific validation rules behind the same stage seams),
   never a WorkGraph/Organizations redesign. Invariant tests must cover a
   second synthetic domain end-to-end.
5. **Rights/provenance carry-through.** The render models and playback
   frames carry the snapshot's provenance + rights scope summaries forward
   (read-only summaries — renderers never widen rights; C6 usage-context
   vocabulary is consumed, never invented).

## Consequences

- A13 becomes producible end-to-end: authorized source (fixture-grade
  authorized manifest, honestly labeled) -> pipeline -> SWM -> two
  materially different realities, all TL-verifiable with the standard gates.
- No new shared contracts types across planes (per-package duplication is
  the accepted ownership cost — same law as wave 4).
- The w5c packet's host wiring is integration-time TL work; the worker
  delivers the playback engine + tests + honest composition-root examples.
- Midnight-deadline discipline: lanes are severable (w5a + w5b parallel;
  w5c can follow into the freed w4c slot); no lane blocks another's merge.

## References

- docs/contracts/sports-world-model.md (the pipeline + invariants)
- docs/roadmap/sporta-roadmap.md P6; docs/testing/sporta-acceptance.md A13
- docs/architecture/adr-wave4-c6-host.md (the C6/host laws this wave builds on)
- packages/sporta-world/src/domain/snapshot.ts (the frozen ingestion seam)
