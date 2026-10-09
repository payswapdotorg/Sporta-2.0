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

## W2 — 2026-10-09 — TL wave-2 integration (three real-execution lanes, A17 real-execution leg)

- date: 2026-10-09 (merges 02:09–04:24 UTC; final-head TL battery re-verified 2026-10-09 ~07:50 UTC after a pod recycle — numbers below are TL-measured first-hand, never from worker self-report)
- merge SHAs: worker-c merge `c9eb06c` (branch wave2/worker-c-2, lane head `3a6e9af`; console-lane in-progress state `1c49203` recorded mid-flight), worker-b merge `bec4d47` (branch wave2/worker-b-2, lane head `a0d7171`; console-lane in-progress state `24998fe`), worker-a merge `b5c3f97` (branch wave2/worker-a-2, lane head `5d98965`; console-lane in-progress state `f1fffaf`); serial integration order C → B → A; final head `b5c3f97` = wave 2 integrated
- worker/work-order IDs: w2c-3 (C: real Arena HTTP transport + C5/C6 provider/deployment seam), w2b-3 (B: durable fs artifact storage + real kdenlive editor adapter), w2a-3 (A: real Zcode AgentRuntime adapter + A17 real-execution leg)
- architecture check: `pnpm architecture:check` → OK, 0 violations, 0 new (at final head, TL-measured)
- surface check: `node scripts/architecture/sporta-surface-check.mjs` → OK — all frozen names present, additive-only growth (TL-measured)
- typecheck: scoped `tsc -b` over all 12 sporta packages → PASS clean (TL-measured at final head)
- lint: `pnpm lint` → 0 errors, 70 warnings — identical to the wave-0/1 baseline (TL-measured)
- tests: full battery `pnpm exec tsx --test packages/sporta-*/test/*.test.ts` → 199 pass / 0 fail / 0 skipped (wave-1 baseline 155 + 44 wave-2 tests; TL-measured at final head)
- landed per lane: C — `packages/sporta-arena/src/adapters/httpArenaTransport.ts` (real HTTP transport behind ArenaTransportPort) + `src/domain/resultValidation.ts` + 507-line transport test + `sporta-product` deployment seam (`src/domain/deploymentDescriptor.ts`, `src/adapters/deployment.ts`); B — `packages/sporta-artifacts/src/adapters/FsArtifactBlobStore.ts` (real durable content-addressed FS store) + `packages/sporta-editors/src/adapters/KdenliveAdapter.ts` + `kdenliveXml.ts` (real kdenlive MLT XML round-trip) + contract additive exports; A — `packages/sporta-work/src/adapters/zcodeAgentRuntime.ts` (real process lane driving the zcode-cli headless interface) + `packages/sporta-product/test/a17-real-execution.test.ts` + `test/fixtures/zcode-cli-standin.mjs` + ports/contract additive changes
- acceptance evidence: A17 real-execution test (EVIDENCE CLASS: REAL execution leg — real child-process spawn, real wall time, real stream-json events on real pipes, real exit code; FIXTURE stores and executable stand-in — the vendored apps/zcode-cli cannot build in this sandbox, missing @zcode/model-option-map, @zcode/provider, @zcode/provider-node, @zcode/zcode-cua, @zcode/shared — typed honestly in the test header); FsArtifactBlobStore + KdenliveAdapter real round-trip tests; HttpArenaTransport real TCP/HTTP tests (73 pass lane-scoped, TL re-measured in the full battery)
- honest boundaries: the real zcode-cli binary execution is UNMEASURED (stand-in speaks the same headless interface; typed in BLOCKERS); HttpArenaTransport is importable inside sporta-arena (deep path in its own tests) but not yet re-exported through the arena contract entrypoint (a wave-3 additive-export note, TL-serialized); the C5/C6 deployment seam is descriptor-level (no live provider credentials exercised — Vercel/Neon/R2/Upstash preview target per docs/architecture/deployment.md stays typed as future)
- deviations: worker lanes were delivered through the console-lane + pushed branches channel (w2x-2 console-lane in-progress states then w2x landed states); ownership audit per lane: diffs confined to owned packages + SPEC/report files
- remaining dependencies: wave-3 frontier list in PROJECT-STATE.md (product read seams + packages/web host conversion to un-pend the ProductLoopTrace stages; A17 full-real loop test wiring the real runtime + FS store + real editor + real HTTP arena into one lineage; C6 rights propagation end-to-end, invariant 22; arena entrypoint additive export)
