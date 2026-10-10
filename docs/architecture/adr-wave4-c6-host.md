# ADR — Wave 4: C6 rights planes, rejection/rollback decisions, and the product UX host conversion (TL-serialized)

Date: 2026-10-10. Status: accepted (TL-only serialization; workers implement
behind their own entrypoints). Author: TL. Base: wave-3 integrated head
`42e4c46` (see integration log W3-A).

## Context

Wave 3 landed the read seams (editor history, learning artifacts,
organization candidates, escalation/results — all four DONE) plus the
WorkGraph refs and the A17 FULL-REAL loop (269/269 TL-measured). The
remaining frontier (PROJECT-STATE.md):

- item 2 — product UX host conversion (packages/web), the P3
  human-takeover leg: the host surface consuming the projection +
  learning-consent intake + takeover UX;
- item 4 — C6 rights propagation end-to-end (invariant 22: "Rights,
  privacy and retention policy propagate through artifacts, editors and
  Arena"): the editor READ half landed (W3-B); the artifact plane and the
  arena read plane are open;
- the W2 `a17-real-execution` flake (the pre-existing race in the W2
  real-process stand-in's terminal event — documented in integration log
  W3-C);
- the carried wave-1 note: `rejected`/`rolled-back` candidate/promotion
  states are unproducible (no decision path exists in the registry; the
  W3-A read seam returns honest empty arrays for them).

## Decision

1. **C6 read gates — per-package additive usage contexts.** Each plane's
   read seam gains an OPTIONAL caller-declared usage-context input
   mirroring the ratified W3-B `EditorSessionHistoryUsageContext` pattern
   (`usages: readonly string[]` mirroring `RightsScope.usages`
   vocabulary; a bare input declares no usages and the gate is
   FAIL-CLOSED). Listing surfaces exclude prohibited records (honest
   absence, never an error); direct read surfaces refuse with typed
   errors. NO new shared contracts type is introduced — per-package
   duplication is the accepted ownership cost (the same law as the
   record-file substrate). Planes this wave: artifact reads (worker B —
   blob/revision/lineage/manifest reads as the surfaces expose them),
   escalation/result reads (worker C — the W3-C `EscalationReadPort`).
2. **Retention.** RetentionPolicy fields already on the PolicySet
   propagate to reads exactly as `@sporta/policy` defines them. If the
   retention vocabulary needs new semantics, that is a TL serialization
   note — workers never invent policy semantics.
3. **Organization rejection/rollback decision path** (worker A):
   append-only typed decision records in `sporta-organizations` mirroring
   the promotion gates — evidence/policy gated, immutable after decision,
   idempotent per candidate+decision, rollback requires a prior promotion
   of the same candidate. Additive to the promotion-history port (never
   rename/remove). The lab read seam surfaces the new states
   field-for-field (the honest empty arrays become real data).
4. **Projection optional-dep consumption** (worker C): the
   `OrganizationCandidateReadPort` enters the product loop deps as an
   optional seam — present ⇒ the organization-improvement stage goes DONE
   with field-for-field summaries; absent ⇒ seam-pending (the graceful
   degradation law, exactly like the learning/escalation seams).
5. **Product UX host conversion** (worker C): an ADDITIVE sporta surface
   in `@zcode/web` (e.g. `src/sporta/`) rendering the live
   `ProductLoopTrace` projection (stages, seam states, evidence grades)
   plus the two write paths: learning-consent intake (accept/decline →
   the learning-intake seam) and takeover entry (user append through the
   work-graph admission seam). The composition root is headless-testable
   (node:test + tsx — the repo law); real adapters where they are real
   per the a17-full-real reference, fixture stores labeled. The workspace
   dependency `@zcode/web → @sporta/product` lands at INTEGRATION time by
   the TL (the wave-1 WO-C1 precedent: transitional gitignored symlinks
   during worker development; the lockfile and root/other-package
   manifests are TL-owned — workers never touch them). UI honesty law:
   the render surface is typed exactly as what ran (build-verified vs
   browser-tested vs untested) — never claimed beyond.
6. **W2 flake stabilization** (worker A): the fix lives in owned code
   (the test, the stand-in fixture, and/or the W2 adapter); stability is
   proven by ≥ 20 consecutive green runs of the test file; the
   assertions are never weakened — if the observation itself is racy, it
   is made deterministic, not deleted.

## Consequences

- The lanes are decoupled: w4a (work/organizations/lab + the product-side
  test file it authored in W2), w4b (artifacts + the editors write-plane
  audit), w4c (arena gate + product projection + the web host). Zero
  cross-lane file overlap is expected; the surface check and the
  TL-performed ownership audits enforce it at integration.
- After wave 4, invariant-22 propagation is enforceable on READS across
  all three planes (editor, artifact, arena), and the P3 human-takeover
  leg has a real host surface consuming the un-pended projection.
- Risks: usage-vocabulary drift is mitigated by the mirror-the-W3-B
  pattern law; the transitional symlink hides the web→product dependency
  edge from the lockfile until the TL registers it (typed integration
  work order); the vite build may be resource-limited on this sandbox
  (honest typing; CI covers the full build).
- Post-wave-4 frontier (roadmap): P6 sports production realities, P7
  live/shared editor sessions, P8 production hardening (provider
  fallback, persistent workers, local install, hosted preview, product
  acceptance).
