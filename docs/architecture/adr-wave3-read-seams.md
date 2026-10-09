# ADR — Wave 3 read seams (TL-serialized)

Date: 2026-10-09. Status: accepted (TL-only serialization; workers implement
behind their own entrypoints). Author: TL. Base: wave-2 integrated head
`b5c3f97` (see integration log W2).

## Context

The product shell's `ProductLoopTrace` projection (sporta-product) renders a
12-stage loop, but six stages are SEAM-PENDING because v1 exposes no
read-only access from a work graph to the cross-domain state those stages
describe:

- `takeover` / `editor` — no editor-session history read seam;
- `learning` — no learning-artifact read seam;
- `arena` / `result` — no escalation/result read seam reachable from a
  graph (v1 graph status is the only escalation signal);
- `organization-improvement` — no organization candidate/promotion read
  seam.

Wave 2 landed the REAL adapters (zcodeAgentRuntime, FsArtifactBlobStore,
KdenliveAdapter, HttpArenaTransport) and the A17 real-execution leg; the
frontier (PROJECT-STATE.md, wave-3 items 1–5) is un-pending these stages.

## Decision

1. The read-seam PORT TYPES live in `sporta-contracts`
   (`src/records/readSeams.ts`, re-exported by the entrypoint):
   `EditorSessionHistoryReadPort`, `LearningArtifactReadPort`,
   `OrganizationCandidateReadPort`, `EscalationReadPort` — read-only,
   bounded queries (optional filters + `limit`), summary shapes that
   mirror the canonical records field-for-field. No mutation surfaces.
2. `WorkGraphNode` gains an OPTIONAL additive `refs?: readonly
   WorkGraphNodeRef[]` (typed kinds: capability-gap, escalation,
   arena-result, artifact-revision, editor-session, learning-artifact).
   v1 graphs without refs stay valid; the projection degrades to
   seam-pending when refs are absent — never errors.
3. Ownership of IMPLEMENTATION follows the architecture policy:
   - worker-a: sporta-work appends refs (escalation/gap/result edges at
     the status transitions it already owns); sporta-lab/sporta-evaluation
     implement `OrganizationCandidateReadPort`;
   - worker-b: sporta-editors implements `EditorSessionHistoryReadPort`
     (rights-gated: sessions whose PolicySet forbids the caller's usage
     are not listed);
   - worker-c: sporta-product learning intake implements
     `LearningArtifactReadPort` + the projection wiring (optional deps —
     absent seam ⇒ stage stays pending); sporta-arena implements
     `EscalationReadPort` + re-exports `HttpArenaTransport` additively
     through its entrypoint (the W2 note).
4. The projection consumes the seams as OPTIONAL injected deps
   (`ProductLoopProjectionDeps` grows optional fields): no seam ⇒ the
   stage detail stays the honest `pending: …` string. Additive-only; the
   frozen v1 surfaces are unchanged; the surface check must stay green.
5. C6 (invariant 22) rides the same seams: rights propagation is enforced
   at the READ boundaries (editor history and escalation/result reads
   carry the PolicySet gate), so the product loop can only surface state
   the operator is permitted to see.

## Consequences

- The wave-3 lanes are decoupled: each worker implements against the
  authoritative shapes in contracts; no cross-lane type negotiation.
- The A17 full-real loop test (wave-3 lane C) can wire real adapters +
  real read seams into ONE lineage and assert every stage DONE — the
  first end-to-end real-evidence pass over the complete loop.
- The wave-4 product UX host conversion (packages/web) consumes the
  un-pended projection + read seams; it is NOT part of wave 3 (typed in
  PROJECT-STATE.md current frontier).
- Risks: summary/record drift is mitigated by the field-for-field law
  (implementers may return supersets, never fewer fields); unbounded
  reads are mitigated by the bounded-query law (limit required default
  capped by implementers).
