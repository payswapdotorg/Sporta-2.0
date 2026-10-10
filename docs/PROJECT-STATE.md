# Sporta 2.0 Project State

Status: WAVE 5 IN PROGRESS — LANE A LANDED (w5a: P6 perception pipeline stages acquisition->normalization->perception->tracking->calibration->event reconstruction as pure additive typed domain functions + pipeline->ingestObservations composition + second-domain invariant warehouse-robotics; NO-ML honesty; 379/379 + 2/2 web host TL-measured post-merge); LANES B/C (renderer/realities + playback) IN FLIGHT; post-wave-5: roadmap P7/P8

## Repository identity

Repository: payswapdotorg/sporta-2.0

Upstream foundation: zai-org/zcode

Architecture baseline: docs/architecture/sporta-architecture-lock.md

Wave 0 baseline commit: see integration log entry W0 (docs/implementation/integration-log.md).

## Completed architecture setup

- repository source-of-truth declaration: COMPLETE
- ZCode-substrate ADR: COMPLETE
- architecture lock: COMPLETE
- dependency graph: COMPLETE
- canonical contracts: COMPLETE
- artifact/edit round-trip contract: COMPLETE
- organization-learning contract: COMPLETE
- Arena escalation contract: COMPLETE
- Sports World Model contract: COMPLETE
- editor architecture: COMPLETE
- deployment architecture: COMPLETE
- roadmap: COMPLETE
- work orders: COMPLETE
- acceptance gates: COMPLETE
- TL handoff: COMPLETE
- worker packets: COMPLETE

## Wave 0 — TL-only baseline (FROZEN)

The 11 planned modules (docs/architecture/planned-module-policy.md) now exist
as managed modules with frozen public contract exports:

| Module | Package | Owner | requires |
| --- | --- | --- | --- |
| sporta-policy | @sporta/policy | tl | (none) |
| sporta-contracts | @sporta/contracts | tl | sporta-policy |
| sporta-work | @sporta/work | worker-a | sporta-contracts |
| sporta-organizations | @sporta/organizations | worker-a | sporta-contracts |
| sporta-lab | @sporta/lab | worker-a | sporta-contracts, sporta-work, sporta-organizations |
| sporta-evaluation | @sporta/evaluation | worker-a | sporta-contracts, sporta-organizations |
| sporta-artifacts | @sporta/artifacts | worker-b | sporta-contracts |
| sporta-editors | @sporta/editors | worker-b | sporta-contracts, sporta-artifacts |
| sporta-world | @sporta/world | worker-b | sporta-contracts |
| sporta-compute | @sporta/compute | worker-b | sporta-contracts |
| sporta-arena | @sporta/arena | worker-c | sporta-contracts |
| sporta-product | @sporta/product | worker-c | sporta-contracts, sporta-work, sporta-organizations, sporta-artifacts, sporta-editors, sporta-world, sporta-arena, sporta-evaluation, sporta-lab, sporta-policy |

Dependency direction (module-migration-map): policy -> contracts ->
work/artifacts/organizations/world/arena -> lab/evaluation/editors/compute ->
product projections. Verified by architecture check (no cycles, no
undeclared cross-module imports, public entrypoints only).

Contract surface layout per module: `src/module.ts` (manifest mirroring
architecture-policy.yaml), `src/contract.ts` (single public entrypoint),
`src/contract.example.ts` (compile-checked example), `CONTRACT.md`
(invariants types cannot express). sporta-contracts keeps record
definitions in module-internal `src/records/*` files re-exported through
its public entrypoint.

### Worker product-shell seam (Wave 1 decision)

RESOLVED at wave-1 integration: Worker C created `packages/sporta-product`
through work-order WO-C1; the TL registered the managed architecture-policy
entry and linked the real workspace dependencies at integration time
(the WO-C1 local symlinks were transitional and gitignored).

## ZCode substrate reuse map (Wave 0 finding)

Reused directly (no second authority created):

| Sporta need | ZCode substrate | Sporta module consuming it |
| --- | --- | --- |
| execution authority (runs) | apps/zcode-cli AgentRuntime core | sporta-work (adapters layer) |
| session/conversation authority | packages/services/src/session | sporta-work adapters |
| generic tool registry + MCP | apps/zcode-cli tool system, packages/services/src/mcp-sync | sporta-compute, sporta-work adapters |
| generic artifact/tool storage ports | packages/services/src/storage, file/fs services | sporta-artifacts adapters |
| credential vault | packages/services/src/credential | provider adapters (compute/editors/arena transport) |
| local/remote workspaces for editors | remote-workspace stack | sporta-editors adapters |
| permission/admission boundaries | cua-permission-broker, runtime admission | sporta-work/sporta-arena boundary checks |
| broadcast/event seams | packages/services/src/broadcast | sporta product projections |
| product host surface | packages/web, packages/server, packages/desktop | sporta product projections (Worker C) |

ZCode extension seams identified (to be declared in module.ts requires
when the adapters land; TL-serialized policy changes):

1. AgentRuntime programmatic composition entry — sporta-work needs a
   typed way to start a run with an OrganizationVersion composition.
2. Durable content-addressed storage port — sporta-artifacts layers
   lineage/manifests over the generic storage port.
3. Editor session workspace binding — sporta-editors reuses local/remote
   workspace facilities per docs/architecture/editor-integration.md.
4. Takeover admission — user appends during active runs route through
   existing admission/lease boundaries, not a second inbox.
5. Event projection seam — product shell consumes WorkGraph facts via
   existing broadcast/event surfaces.

## Root package/lockfile strategy

- Single pnpm workspace root; pnpm@10.33.2 pinned (packageManager field).
- New modules enter via the existing `packages/*` glob; no workspace yaml change.
- pnpm-lock.yaml is TL-owned; workers never add dependencies. The Wave 0
  lockfile change only links the 11 new @sporta/* workspace packages
  (no external dependencies added).
- Worker dependency needs go through a work-order note; the TL installs
  and commits serialized.

## Verification protocol (this sandbox)

- `pnpm architecture:check`: OK, 0 violations, 0 new (verified at the
  wave-1 integration commit, after all three worker merges).
- `node scripts/architecture/sporta-surface-check.mjs`: OK — all frozen
  Wave 0/1 public names still exported by every module; growth is
  additive-only (TL-owned tool, run it after any contract-touching merge).
- Scoped `pnpm exec tsc -b packages/sporta-*` (12 packages): PASS (clean).
- `pnpm lint`: 0 errors, 70 warnings — identical to the pre-Wave-0
  baseline (all warnings pre-existing).
- Tests: `pnpm exec tsx --test` across all 11 test suites — 155/155 pass,
  including the TL-authored A17 seeded-loop proof
  (packages/sporta-product/test/a17-seeded-loop.test.ts).
- Environment limitation (typed honestly): the full-repo
  `pnpm typecheck` (tsc -b across all ZCode packages) is OOM-killed on
  this 4 GB sandbox — it is an environment limitation, not a repository
  error. CI (GitHub Actions) runs the full typecheck. Workers verify with
  the scoped protocol above and report results honestly.
- `pnpm fmt:check` fails on ~34 pre-existing files on clean main; Sporta
  files are formatted clean (scoped oxfmt verified).
- Known limitation (typed honestly): tsx executes tests by transpilation
  without typechecking — test files are syntax-checked at runtime only.
  src/ files carry the full tsc type gate.

## Worker test law (Wave 0 decision)

Workers write tests with `node:test` executed via the repo's existing
`tsx` devDependency (`pnpm exec tsx --test packages/<pkg>/test/*.test.ts`).
Zero new test-framework dependencies. Fixture evidence must be labeled
fixture; measured evidence must state how it was measured.

## Implementation status

Status lines dated 2026-10-10 at the wave-3 worker-a merge head `89617b7`
(see integration logs W2/W3-B/W3-C/W3-A for the merge SHAs, per-worker
branches and the TL-measured batteries).

- Sporta semantic packages: 12 modules implemented (Wave 0 skeleton +
  Wave 1 domain/app/adapters + Wave 2 real-execution adapters + tests)
- Intent/Work Graph: IMPLEMENTED (worker-a; idempotent appends, status
  machine, takeover-first-class, AgentRuntime seam REAL since W2:
  packages/sporta-work/src/adapters/zcodeAgentRuntime.ts — real child
  process driving the zcode-cli headless interface; fixture adapter
  retained and labeled; typed node REFS since W3-A: WorkGraphRefsPort +
  escalateGap/recordArenaResult/commitArtifactRevision append refs at
  the owned status transitions — append-only, idempotent per
  (kind, refId), immutable ledger law)
- Organization Lab: IMPLEMENTED (worker-a; population search, replay,
  deterministic explainable resolver, immutable promotion, per-user
  personalization isolation; candidate READ SEAM since W3-A:
  OrganizationCandidateReadPort in sporta-lab field-for-field over the
  organizations promotion-history port, bounded queries, read-only)
- Artifact Graph: IMPLEMENTED (worker-b; immutable revisions, lineage,
  content-addressed store with read-time integrity verification; REAL
  durable FS store since W2: FsArtifactBlobStore)
- Editor Broker: IMPLEMENTED (worker-b; explainable resolution,
  rights-gated sessions, round-trip + opaque-import paths; REAL kdenlive
  MLT XML round-trip adapter since W2: KdenliveAdapter + kdenliveXml;
  editor-session history READ SEAM since W3-B: EditorSessionHistoryService
  on the frozen contracts port, rights-gated per invariant 22, backed by
  the real FS history ledger FsEditorSessionHistoryStore)
- Sports World Model runtime: IMPLEMENTED (worker-b; provenance-gated
  idempotent ingestion, uncertainty carried)
- Arena integration: IMPLEMENTED (worker-c; idempotent gaps/escalations,
  context minimization, validate-before-apply; REAL HTTP transport since
  W2: httpArenaTransport.ts — entrypoint re-export is a wave-3 note)
- Organization evaluation/promotion: IMPLEMENTED (worker-a; honest basis
  labels, intervention cost, evidence-gated immutable promotion)
- Product UX conversion: PROJECTION IMPLEMENTED (worker-c; 12-stage
  ProductLoopTrace + learning-consent intake; takeover/editor/learning/
  result/organization-improvement stages still SEAM-PENDING — the
  wave-3 read-seams + packages/web host conversion frontier; UI host
  conversion not started)
- Provider/deployment conversion: SEAM IMPLEMENTED (worker-c W2;
  descriptor-level DeploymentDescriptor + deployment adapter in
  sporta-product — no live provider credentials exercised; the
  Vercel/Neon/R2/Upstash preview target per deployment.md stays typed
  as future)
- A17 real-execution leg: EXECUTION REAL since W2 (a17-real-execution
  test: real spawn, real wall time, real exit code, stream-json on real
  pipes; stores + executable fixture/stand-in, honestly labeled — the
  real zcode-cli bundle is unbuildable in this sandbox, typed in
  BLOCKERS)

## A17 acceptance status

A17 (complete loop) is proven at two evidence grades:

1. SEEDED (fixture): packages/sporta-product/test/a17-seeded-loop.test.ts
   — the complete loop on ONE WorkGraph/artifact lineage with append-only
   WorkGraph and preserved r1 lineage asserted. EVIDENCE CLASS: fixture
   (in-memory stores, fake transport, fixture runtime seam).
2. REAL-EXECUTION LEG (W2): packages/sporta-product/test/
   a17-real-execution.test.ts — the SAME seeded loop with the REAL
   zcodeAgentRuntime adapter at the execution seam. EVIDENCE CLASS: REAL
   execution leg (real spawn, real wall time, real stream-json events on
   real pipes, real exit code) + FIXTURE stores and executable stand-in
   (the vendored apps/zcode-cli cannot build in this sandbox — typed in
   the test header and BLOCKERS).

The FULL-REAL A17 (real runtime + real FS store + real kdenlive editor +
real HTTP arena in ONE lineage) remains open and is the wave-3 frontier —
never claim it as done.

## Current frontier

Wave 3 candidates (typed from worker NEXT DEPENDENCIES + the roadmap
phases P3/P7/P8; wave-2 items 1-6 are landed, see integration log W2):

1. Product read seams to un-pend the ProductLoopTrace stages:
   (a) editor-session history read port — DONE (W3-B landed @ 677e624:
   EditorSessionHistoryReadPort implemented exactly + rights-gated
   per invariant 22 + real FS-backed history ledger; see integration
   log W3-B);
   (b) learning-artifact read port (learning stage) — DONE (W3-C landed
   @ 140a81e: LearningArtifactReadPort + product projection wiring with
   optional read-seam deps, graceful degradation law);
   (c) organization candidate/promotion read access
   (organization-improvement stage) — DONE (W3-A landed @ 89617b7:
   OrganizationCandidateReadPort in sporta-lab field-for-field over the
   additive OrganizationPromotionHistoryPort + WorkGraph refs at owned
   status transitions; see integration log W3-A);
   (d) escalation/gap + expert-result refs reachable from a work graph
   (arena/result stages) — DONE (W3-C: EscalationReadPort in
   sporta-arena + entrypoint re-export of HttpArenaTransport — the W2
   note closed);
   contracts additions TL-serialized @ 14836c6, additive-only.
2. Product UX host conversion (packages/web integration): the product
   shell UI host consuming the projection + learning-consent intake +
   takeover UX (P3 human-takeover leg of the roadmap) — w4c lane IN
   FLIGHT. Includes wiring OrganizationCandidateReadPort into the
   product projection as an optional dep (w3a NEXT DEPENDENCIES note 2 —
   the decided-state surfacing it consumes is now landed in W4-A).
3. A17 full-real loop test — DONE (W3-C: a17-full-real.test.ts — real
   process + real FS store + real MLT XML round-trip + real HTTP arena in
   ONE lineage, every ProductLoopTrace stage done, per-leg evidence
   honestly labeled).
4. C6 rights propagation end-to-end (invariant 22: PolicySet propagation
   across artifact/editor/arena planes, enforced and tested) — the
   editor READ half landed (W3-B); the artifact READ plane landed
   (W4-B @ d6e9aec: ArtifactGatedReadService + pure invariant-22 gate +
   REAL FS lane evidence; editor WRITE plane gated in openSession +
   audit typed); the ARENA read gate is w4c's (IN FLIGHT). The W2
   a17-real-execution flake is FIXED (W4-A @ 26ea019: adapter terminal-
   event laws + 20/20 TL-measured consecutive green — the W3-C-typed
   race is closed).
5. Arena entrypoint additive re-export of HttpArenaTransport — DONE
   (W3-C closed the W2 note).
6. (Post-wave-3, roadmap P6/P7/P8) sports production perception/
   tactical/3D/anime realities + playback; live/shared editor sessions
   (integration level 3); provider fallback + persistent workers +
   local install + hosted preview + product acceptance.
