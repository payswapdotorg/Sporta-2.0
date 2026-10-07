# Sporta 2.0 Project State

Status: WAVE 0 FROZEN — WORKERS A/B/C DISPATCHED

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

Worker C's product UX modules are not among the 11 planned modules. Per
the worker packets, Worker C creates `packages/sporta-product`-style
projection modules through a work-order note; the TL registers the
architecture-policy entry at integration time (TL-owned, serialized).
Until registered, new module directories are outside the managed set and
must not claim architecture-check coverage.

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

- `pnpm architecture:check`: OK, 0 violations, 0 new (verified at Wave 0
  commit).
- Scoped `pnpm exec tsc -b packages/sporta-*`: PASS (clean).
- `pnpm lint`: 0 errors, 70 warnings — identical to the pre-Wave-0
  baseline (all warnings pre-existing).
- Test recipe: `pnpm exec tsx --test <test-files>` — verified green
  (packages/sporta-contracts/test/contract.test.ts, 3 passing).
- Environment limitation (typed honestly): the full-repo
  `pnpm typecheck` (tsc -b across all ZCode packages) is OOM-killed on
  this 4 GB sandbox — it is an environment limitation, not a repository
  error. CI (GitHub Actions) runs the full typecheck. Workers verify with
  the scoped protocol above and report results honestly.
- `pnpm fmt:check` fails on ~34 pre-existing files on clean main; Sporta
  files are formatted clean (scoped oxfmt verified).

## Worker test law (Wave 0 decision)

Workers write tests with `node:test` executed via the repo's existing
`tsx` devDependency (`pnpm exec tsx --test packages/<pkg>/test/*.test.ts`).
Zero new test-framework dependencies. Fixture evidence must be labeled
fixture; measured evidence must state how it was measured.

## Implementation status

- Sporta semantic packages: SKELETON FROZEN (Wave 0, 11 modules)
- Intent/Work Graph: IN PROGRESS (Worker A, wave-1)
- Organization Lab: IN PROGRESS (Worker A, wave-1)
- Artifact Graph: IN PROGRESS (Worker B, wave-1)
- Editor Broker: IN PROGRESS (Worker B, wave-1)
- Sports World Model runtime: IN PROGRESS (Worker B, wave-1)
- Arena integration: IN PROGRESS (Worker C, wave-1)
- Organization evaluation/promotion: IN PROGRESS (Worker A, wave-1)
- Product UX conversion: IN PROGRESS (Worker C, wave-1, via work-order seam)
- Provider/deployment conversion: IN PROGRESS (Worker C, wave-1)

## Current frontier

Wave 0 is frozen. Workers A/B/C run concurrently per
docs/architecture/sporta-dependency-graph.md Wave 1. TL merges worker
branches serially, verifies integration gates, and updates this file
with dated, commit-addressed evidence records as implementation lands.
