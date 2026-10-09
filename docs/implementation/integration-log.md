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

## W3-B — 2026-10-09 — TL wave-3 first lane integration (editor session history read seam + rights-gated reads)

- date: 2026-10-09 (worker delivery 10:51 UTC through the capacity-degraded morning window; TL battery re-verified 10:55–11:05 UTC — all numbers TL-measured first-hand, never from worker self-report)
- merge SHA: `677e624` (branch wave3/worker-b, lane code head `ea27d70`, report commit `8c474cd` on top; merged tree verified identical to the verified branch tree)
- worker/work-order IDs: w3b-1 + w3b-2 (Worker B lane: EditorSessionHistoryReadPort rights-gated per invariant 22 + FS-backed session history + rights propagation enforcement on reads + real kdenlive lane proof)
- architecture check: `pnpm architecture:check` → OK, 0 violations, baseline 0, new 0 (TL-measured)
- surface check: `node scripts/architecture/sporta-surface-check.mjs` → OK — all frozen names present, additive-only growth (editors 9 frozen + 56 additive) (TL-measured)
- typecheck: scoped `tsc -b packages/sporta-{artifacts,editors,world,compute}` → exit 0 clean (TL-measured)
- lint: `pnpm lint` → 0 errors, 70 warnings — identical to the wave-0/1/2 baseline (TL-measured)
- tests: scoped artifacts+editors `tsx --test` → 77 pass / 0 fail; FULL battery `pnpm exec tsx --test packages/sporta-*/test/*.test.ts` → 222 pass / 0 fail / 0 skipped (wave-2 baseline 199 + 23 new worker-b tests; TL-measured)
- landed per lane: `packages/sporta-editors/src/app/EditorSessionHistoryService.ts` (the frozen contracts port implemented exactly + additive contract re-exports from `@sporta/editors/contract`); `src/domain/history.ts` (165 — the pure invariant-22 gate `sessionVisibleToUsage`, limit law, filter/order helpers); `src/domain/ports.ts` + `src/app/EditorBrokerService.ts` (optional `sessionHistory?` seam, opt-in append wiring, idempotent re-open self-heal); `src/adapters/InMemoryEditorSessionHistoryStore.ts` + `src/adapters/FsEditorSessionHistoryStore.ts` (199 — real filesystem JSON ledger, sha-256-sharded addresses, atomic stage-then-rename writes, read-time integrity verification with typed corruption errors, durability across fresh instances); 3 test files (sessionHistory 10, FsEditorSessionHistoryStore 9, rightsReadGate.integration 4 — the W3B-2 end-to-end proof on the REAL W2 kdenlive lane); SPEC/CONTRACT wave-3 sections
- acceptance evidence: EVIDENCE CLASS REAL for the FS store (real files on real disk, byte-compared, sizes measured; fresh-instance durability) and the rights gate on the real kdenlive lane (real MLT XML round-trip through the W2 adapter); in-memory store is fixture-grade by design; worker report honest (every claimed number matched the TL re-measure exactly — 77/222/0/70)
- honest boundaries: the FS ledger `list` is O(ledger-files) per query (bounded queries bound the RESULT; the scan is the documented cost — an indexed store is future polish at the same port seam); the rights gate applies after the bounded page read, so a prohibited-majority page can return shorter than the limit (documented in SPEC); the usage-context vocabulary is caller-declared (propagation of the PolicySet gate is enforced, caller identity is NOT — holders unevaluated by design); the session-state store itself (EditorSessionStorePort in wiring) remains in-memory
- deviations: the additive usage-context option is named `usage` on `EditorSessionHistoryListInput` (the packet left the name open); `sessionHistory?` on `EditorBrokerDeps` is optional-and-opt-in rather than required (additive-only law: existing wave-2 wiring must compile and behave identically — verified by the identical lint/test baselines); oxfmt applied only to the 7 new files (base 14836c6 is not format-clean — 45/67 pre-existing sporta-editors failures left untouched for reviewability; a repo-wide format pass is a TL decision, not a worker-lane change)
- remaining dependencies: wave-3 items 1b/1c/1d (learning-artifact read port, organization candidate reads, escalation/result refs — lanes w3a/w3c in flight at this merge), product UX host conversion (packages/web), A17 full-real loop (w3c), C6 rights propagation end-to-end (the editor READ half is now landed; arena/remaining planes open), HttpArenaTransport entrypoint re-export (w3c)

## W3-C — 2026-10-09 — TL wave-3 second lane integration (arena read seam + projection wiring + A17 full-real loop)

- date: 2026-10-09 (worker delivery ~17:10 UTC through the turn-cutting window — the worker executed real commands in bursts across session rollbacks, sandbox state persisting; TL battery re-verified 17:14-17:35 UTC — all numbers TL-measured first-hand)
- merge SHA: `140a81e` (branch wave3/worker-c, lane code commit `6f4c0d2`, delivery-sha rider `b55d78c` on top; 3-way merge from base 14836c6 onto the w3b-merged main — both lanes' files verified present post-merge)
- worker/work-order IDs: w3c-1 + w3c-2 + w3c-3 (Worker C lane: EscalationReadPort + HttpArenaTransport entrypoint re-export; LearningArtifactReadPort + product projection optional read-seam wiring; A17 full-real loop test)
- architecture check: `pnpm architecture:check` → OK, 0 violations, baseline 0, new 0 (TL-measured at the delivered branch AND at the merged head)
- surface check: OK — all frozen names present, additive-only (arena 7 frozen + 27 additive; product 6 frozen + 7 additive) (TL-measured)
- typecheck: scoped `tsc -b packages/sporta-{arena,product}` → exit 0 clean (TL-measured)
- lint: `pnpm lint` → 0 errors, 70 warnings — identical baseline (TL-measured)
- tests: scoped arena+product 98 (worker-c's own tests all pass); FULL battery at the MERGED head: **246 tests** (199 wave-2 base + 23 w3b + 24 w3c — the count math holds exactly) — 246/246 pass on the recorded clean run (TL-measured)
- FLAKE FOUND + ROOT-CAUSED (the re-run doctrine earning its keep): `packages/sporta-product/test/a17-real-execution.test.ts` ("A17 real execution: the REAL adapter runs a real process and the seeded loop preserves the WorkGraph lineage") fails intermittently — "the terminal event carries the real exit code: stand-in session completed" (a race in the W2 real-process stand-in's terminal event). VERIFIED PRE-EXISTING: at main @3c835fa WITHOUT worker-c it failed 3/8 runs; with worker-c merged, 1-2/6 runs. The worker's reported "223 pass / 0 fail" was honest-but-lucky (its runs missed the race). The new W3C a17-full-real test is stable across all TL runs. Stabilizing this W2 test is a small future fix (typed in PROJECT-STATE remaining dependencies), NOT a worker-c defect — approved with the flake documented.
- landed per lane: `packages/sporta-arena/src/domain/escalationReadSeam.ts` (the EscalationReadPort implementation) + `src/contract.ts` additive re-exports (HttpArenaTransport through the entrypoint — the W2 note CLOSED) + `test/escalationReadSeam.test.ts` (173 lines); `packages/sporta-product/src/domain/learningReadSeam.ts` (LearningArtifactReadPort) + `src/app/productLoopDeps.ts` + `productLoopSeamStages.ts` + `productLoopEscalationStages.ts` + `productLoopProjection.ts` (the projection wiring with optional read-seam deps — graceful degradation law) + `test/a17-full-real.test.ts` (440) + fixtures/support (244+285) + `learningReadSeam.test.ts` (190) + `productLoopProjectionSeams.test.ts` (895) + learningIntake additive changes
- acceptance evidence: the A17 FULL-REAL loop — REAL per leg (real child process with 5 stream-json events + real exit code; real FS blob store content-verified read-back; real MLT XML round-trip 1696→1950 chars with 36 derived operations; real HTTP arena 7 requests) — every ProductLoopTrace stage done on one real-evidence lineage. EVIDENCE CLASSES honestly labeled in the test output. This closes the wave-3 frontier item 3 (A17 full-real).
- honest boundaries (from the worker report, spot-verified): the full-real loop's "real" editor/arena legs use the W2 adapters at fixture scale (the kdenlive adapter on real XML strings, the HTTP arena on a real local server); the projection's optional-deps law is enforced (seams stay pending when deps absent — graceful degradation)
- deviations: the worker recorded its delivery sha in a doc-rider commit on top of the code commit (b55d78c) — the W3B documentation-commit pattern, ratified
- remaining dependencies: w3a lane (read seams 1c/1d: organization candidate reads + escalation/result refs in the work graph — IN FLIGHT at this merge); product UX host conversion (packages/web); the W2 a17-real-execution flake stabilization (small); C6 rights propagation remaining planes; wave-4+ per roadmap P6/P7/P8
