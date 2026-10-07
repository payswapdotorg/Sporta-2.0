# Sporta 2.0 Integration Log

The TL updates this file after every accepted worker merge or architecture decision.

Each entry must contain:

- date;
- merge SHA;
- worker/work-order IDs;
- architecture check result;
- typecheck/lint/test result;
- acceptance evidence;
- deviations;
- remaining dependencies.

Never record a merge as green from worker self-report alone.

## W0 — 2026-10-07 — TL Wave 0 freeze

- merge SHA: (this commit) — `wave0: freeze the 11 sporta semantic module skeletons + policy registration`
- worker/work-order IDs: TL0 (repository conversion, architecture policy, contracts and public export strategy)
- architecture check: `pnpm architecture:check` → OK, 0 violations, 0 new (baseline 0)
- typecheck: scoped `tsc -b packages/sporta-*` PASS; full-repo `pnpm typecheck` OOM-killed on the 4 GB dev sandbox (environment limitation, typed in PROJECT-STATE.md; CI runs the full gate)
- lint: `pnpm lint` → 0 errors, 70 warnings (identical to pre-change baseline)
- tests: `pnpm exec tsx --test packages/sporta-contracts/test/contract.test.ts` → 3 pass / 0 fail (real execution on this machine)
- acceptance evidence: 11 managed modules registered in architecture-policy.yaml with owners (worker-a/worker-b/worker-c), frozen v1 public contracts, module.ts manifests mirroring policy, dependency direction verified (policy -> contracts -> domains -> lab/evaluation/editors/compute); pnpm-lock.yaml updated by TL only (workspace links, zero new external dependencies)
- deviations: none from the documented plan; Worker C product-shell modules deliberately not pre-registered (work-order seam documented in PROJECT-STATE.md)
- remaining dependencies: Workers A/B/C wave-1 implementation (A: sporta-work/organizations/lab/evaluation; B: sporta-artifacts/editors/world/compute; C: sporta-arena + product shell via work-order note)

## W1 — 2026-10-07 — TL wave-1 integration (three worker merges + A17 seeded proof)

- merge SHAs: worker-a merge `24d5796` (branch wave1/worker-a, impl `98a1b35`, report `924caf2`), worker-b merge `2e7c527` (branch wave1/worker-b, head `69e28c3`, 8 commits), worker-c merge `1d5d73f` (branch wave1/worker-c, head `62d92c5`, 5 commits), integration commit: this commit
- worker/work-order IDs: A1–A6(seed) / B1–B6 / C1–C4 + WO-C1 (product shell)
- TL re-verification (never from worker self-report): architecture check OK 0/0 after EACH merge and at the final tree; scoped `tsc -b` over all 12 sporta packages PASS; full test run 155/155 pass (0 fail) across 11 suites; `pnpm lint` 0 errors / 70 warnings = exact pre-change baseline; scoped oxfmt clean; frozen-surface check OK (new TL tool scripts/architecture/sporta-surface-check.mjs — all Wave 0/1 names present, additive-only growth)
- ownership audit: `git diff --name-only c9a90ac..<branch>` for each worker contains ZERO files outside the owned packages + their report file
- A17 seeded proof (TL-authored): packages/sporta-product/test/a17-seeded-loop.test.ts — the complete loop on ONE WorkGraph/artifact lineage with append-only graph + preserved r1 lineage + 12-stage product projection asserted. EVIDENCE CLASS: fixture (in-memory stores, fake Arena transport, fixture AgentRuntime seam) — the real-execution A17 stays open (typed in PROJECT-STATE.md)
- TL-serialized integration changes: sporta-product registered in architecture-policy.yaml (12th managed module); real `pnpm install` linked @sporta/product (lockfile importer added, no external deps); arena contract gained composition-root exports (ArenaClientService, InMemoryArenaTransport, ArenaTransportPort types) with the port declarations MOVED to src/domain/clientPorts.ts to keep the app→contract import direction legal (cycle fixed, public surface unchanged — surface check green)
- deviations ratified: Worker C's strengthened EscalateInput (required tenantRef/learningPermissions/policy) is the canonical record shape — ratified as-is; ArenaTransportPort living in the arena app layer is module-internal and legal; arena tsconfig gained types:["node"] (packages/services convention)
- remaining dependencies: wave-2 frontier list in PROJECT-STATE.md (AgentRuntime adapter, durable storage, real editor adapters, real Arena transport, C5/C6 provider/deployment, contracts additions, web host conversion)
