# Sporta 2.0 Project State

Status: WAVE 1 INTEGRATED — A17 SEEDED LOOP PROVEN (FIXTURE-GRADE); WAVE 2 FRONTIER OPEN

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

All lines below dated 2026-10-07 at the wave-1 integration commit (see
integration log W1 for the merge SHA and per-worker branches).

- Sporta semantic packages: 12 modules implemented (Wave 0 skeleton +
  Wave 1 domain/app/adapters + tests) — fixture-grade in-memory adapters,
  honestly typed
- Intent/Work Graph: IMPLEMENTED (worker-a; idempotent appends, status
  machine, takeover-first-class, AgentRuntime seam DECLARED — fixture
  adapter until the ZCode-side adapter wave)
- Organization Lab: IMPLEMENTED (worker-a; population search, replay,
  deterministic explainable resolver, immutable promotion, per-user
  personalization isolation)
- Artifact Graph: IMPLEMENTED (worker-b; immutable revisions, lineage,
  content-addressed store with read-time integrity verification)
- Editor Broker: IMPLEMENTED (worker-b; explainable resolution,
  rights-gated sessions, round-trip + opaque-import paths, kdenlive +
  unknown-format fixture adapters)
- Sports World Model runtime: IMPLEMENTED (worker-b; provenance-gated
  idempotent ingestion, uncertainty carried)
- Arena integration: IMPLEMENTED (worker-c; idempotent gaps/escalations,
  context minimization, validate-before-apply — fake transport only)
- Organization evaluation/promotion: IMPLEMENTED (worker-a; honest basis
  labels, intervention cost, evidence-gated immutable promotion)
- Product UX conversion: PROJECTION IMPLEMENTED (worker-c; 12-stage
  ProductLoopTrace + learning-consent intake; UI host conversion is a
  later wave)
- Provider/deployment conversion: NOT STARTED (C5/C6, wave 2 — typed
  work-order notes recorded in worker-c.md)

## A17 acceptance status

A17 (complete loop) is proven as ONE coherent seeded WorkGraph/artifact
lineage by packages/sporta-product/test/a17-seeded-loop.test.ts:
intent -> organization -> execution (fixture seam) -> artifact ->
external editor -> user edit -> learning -> capability gap -> Arena ->
expert result -> organization candidate -> evaluation -> promotion, with
append-only WorkGraph and preserved r1 lineage asserted. EVIDENCE CLASS:
fixture (in-memory stores, fake transport, fixture runtime seam). The
real-execution A17 (ZCode AgentRuntime adapter, real editors, real Arena)
remains open and is the wave-2/3 frontier — never claim it as done.

## Current frontier

Wave 2 candidates (typed from worker NEXT DEPENDENCIES):

1. ZCode AgentRuntime adapter implementing @sporta/work's
   AgentRuntimeExecutionPort (the real execution leg of A17).
2. Durable storage adapters for the Artifact Fabric (ZCode storage
   port / R2) replacing in-memory fixture stores.
3. Real editor adapters (kdenlive first) over ZCode local/remote
   workspace facilities.
4. Real Arena transport (HTTP) behind ArenaTransportPort.
5. C5/C6: provider/deployment abstractions + rights propagation across
   planes (Vercel/Neon/R2/Upstash preview target per deployment.md).
6. Contracts wave-2 additions (per-candidate evaluation metrics, actor
   field on WorkGraphNode, cancel/abandon status) — TL-serialized ADRs.
7. Product UX host conversion (packages/web integration) + takeover/
   editor/learning read seams to un-pend the projection stages.
