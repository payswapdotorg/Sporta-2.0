# Worker W10C Implementation Report

Worker: w10c (Wave 10, Worker C lane — the P10-16 composed slice: live ingress + REAL model in ONE run through admission)

Status: WAVE 10 WORKER C IMPLEMENTED (branch `wave10/worker-c`, single commit carrying the composed-slice test + this report as the branch HEAD rider; base SHA 900680a — the P10 lanes-landed base, no newer commits touched).

Scope: the P10-16 vertical slice — ONE test file composing, in ONE lineage: (1) the REAL marketplace admission of a pipeline containing BOTH a pinned model node and a deterministic node (submission digest freezing → automated gates over the REAL w9a graph validator → 3-role review → publish → free-offer entitlement → fail-closed `selectForLaunch` + typed disclosure, with the digest byte-equality law asserted at every hop), (2) the REAL local live source (`RealLocalHttpLiveSourceAdapter`: a real `node:http` server streaming NDJSON frames at the declared cadence on an ephemeral port, grade `real-local-live`), and (3) the REAL run — `LiveTransformRunService` over the EXISTING `TransformRunService` whose `models` port is the REAL `SandboxModelAdapter` (default client — the model step makes a REAL network call through `z-ai-web-dev-sdk`), with the drained live frames as the run's input feed bytes and the ADMITTED release digest pinned into the run record. The binding quota-degradation law is honored: the slice test detects the regime from the actual invocation result (never an env flag) and passes honestly in BOTH regimes — the happy regime pins both real grades; the refused regime degrades to the deterministic-node variant THROUGH the declared-fallback seam (P9-05) with the typed refusal + `fallback-used` recorded and NO real-model output claimed. A second test in the same file deterministically proves the refused arm through the adapter's documented injection seam (the real service's own HTTP 429 error class), so the degradation law is evidenced regardless of the station's quota state. ZERO edits to any `packages/sporta-*/**` file, zero edits to `packages/web/src/**`, zero manifest/lockfile changes — the only changed paths are the new test file and this report.

## WORK ITEMS

- **W10C-1 — `packages/web/test/composedSlice.test.ts` (NEW, 512 lines, 2 tests)** — node:test + tsx (the project law; no new framework, no new dependency). The composed lineage:
  - **Admission leg (REAL):** a fresh `@sporta/marketplace` composition per test (in-memory stores, `FixtureManifestSource`, `FixtureSettlementAdapter` — the W9B/W10A composition precedent) runs the FULL lifecycle over the composed manifest (deterministic trim node + model node pinned to `glm-sandbox-summarizer @ sha256:7…`, edge `node:trim:events -> node:model:events`): `startDraft` → `submitCandidate` (digest frozen once, asserted) → `runAutomatedChecks` (all six declared checks pass, zero gate failures asserted; the graph-validation gate's MEASURED detail asserts `typed DAG validation passed (2 nodes, 1 edges)` — the REAL w9a validator over the composed deterministic+model graph) → `recordReviewDecision` (product/rights/security signoff, `REQUIRED_REVIEW_ROLES`) → `publishApprovedRelease` (PUBLISHED) → `grantEntitlement` (free offer, active) → `buildLaunchDisclosure` + `selectForLaunch` (admitted). THE BYTE-EQUALITY LAW: `listing.currentRelease.releaseDigest === disclosure.releaseDigest === admitted.releaseDigest` (all three pairs asserted) + `admitted.entitlementId === granted.entitlementId` + the disclosure projects BOTH pinned dependencies (trim code + model, never hidden).
  - **Live leg (REAL):** `RealLocalHttpLiveSourceAdapter({ frames: ndjsonEventFrames(5) })` — the liveIngressRun.test.ts pattern verbatim (ephemeral port, cadence 25ms, queueBound 8, the canonical 5-event NDJSON shape; window [1500, 4500] keeps 3, drops 2).
  - **Run leg (REAL):** `LiveTransformRunService` over a `TransformRunService` wired with `models: new SandboxModelAdapter()` (the frozen port seam — W10B-4's exact injection; the DEFAULT client lazily constructs the real SDK client), `deterministic: DeterministicFilterNodeAdapter` over the REAL pinned trim component (`jsonEventStreamTrimComponent`), in-memory artifact fabric (the liveIngressRun precedent), and `releaseDigest: admitted.releaseDigest` — the admitted release pinned into the run record (asserted: `run.release.releaseDigest === admitted.releaseDigest`).
  - **Manifest pinning (BOTH grades, the exact strings):** `liveSessions[0].descriptor.grade === "real-local-live"` (exact), sourceId/framesConsumed=5/closeReason=completed/refusal=null/openedAt-parsable pinned; the deterministic trim step succeeded with real child-process timing > 0 and carry-forward re-verified (`3 kept byte-exact, 2 dropped`); the model step's evidence per the W10B-4 assertion set — measured `timingMs > 0`, honest `cost === null`, the step detail prefix `/^real sandbox model service \(labeled real; model glm-sandbox-summarizer @ sha256:7{64}/`, one model-lane output revision through the artifact fabric (`rev:`-prefixed, semanticEvidence `/^real model lane: real sandbox model service \(labeled real; …/`). Common invariants in BOTH regimes: exactly one live session, the frozen `TransformRunManifest` shape (structural assignability), the live feed pinned on `inputs` exactly like a fixture feed, `outputs.length === 2` (trim revision + exactly one model-lane revision), `semanticFidelity.grade === "measured"` (the deterministic lane's in-process carry-forward), the grade-label law (`"production"` appears nowhere in the record), the composition law (the run service's own ledger reads back the same steps/outputs — one execution, no second runtime), and the teardown law (`adapter.activeBindings()` empty after the cleanly-ended stream; `dispose()` in `finally`).
  - **THE QUOTA-DEGRADATION LAW (binding):** the slice test branches on the ACTUAL model-step result. HAPPY (`succeeded`): both real grades pinned + the real output revision + no fallback fired. REFUSED (`fallback-used`): the typed refusal kind is extracted and asserted to be one of the frozen five (`quota-exhausted|provider-unavailable|credentials-missing|policy-denied|unsupported-operation`), the live grade is STILL `real-local-live`, the degraded deterministic pass-through output is committed and visible (`fallback lane: identity pass-through after …`), and NO real-model output is claimed (no output starts with `real model lane: `, no step detail starts with the sandbox label). Any other terminal (`typed-failure`/`cancelled`) FAILS the test with an explicit degradation-law message — a declared-fallback graph must degrade, never fail or cancel silently. The refused regime is positive evidence: the refusal kind + latencies are asserted and logged, never swallowed.
  - **Deterministic refused-regime proof (test 2):** the SAME full composed lineage (fresh REAL admission + REAL live source + REAL run service) with `SandboxModelAdapter({ client })` where the recording client replays the real service's own HTTP 429 error class (`API request failed with status 429: rate limited` — the W10B-2 classification input) at the adapter's documented injection seam. Asserts: `fallback-used` with the exact typed detail (`quota-exhausted: sandbox model service quota exhausted (HTTP 429): …` + the declared contract), the live grade intact, NO real-model output claimed, and the composition itself — exactly one chat-completion call through the port whose user prompt IS the deterministic trim of the drained LIVE frames (kept evt-2/3/4 present, dropped evt-1/5 absent). Labeled FIXTURE at the client seam only (the W10B recording-client precedent); no real network call is made or claimed in this test.

## CHANGED FILES

All inside the owned boundary `packages/web/test/**` + this report. ZERO edits to any `packages/sporta-*/**` file, zero edits to `packages/web/src/**`, zero `package.json`/`pnpm-lock.yaml` changes (verified: `git status` shows only the new test file; the lockfile diff is empty).

- packages/web/test/composedSlice.test.ts (NEW, 512 lines — see DEVIATIONS 3 for the size note)
- docs/implementation/worker-w10c.md (NEW, this report)

## TESTS

Runner: `pnpm exec tsx --test` (node:test + node:assert/strict — the project law). 2 new tests, both passing on this pod, clean teardown (real live servers closed with their sessions, ports released, `dispose()` in `finally`; no temp dirs — the in-memory lane needs none, the liveIngressRun precedent).

- packages/web/test/composedSlice.test.ts (2):
  1. **W10C-1 / P10-16 REAL composed slice (quota-regime adaptive)** — the full lineage: REAL admission (digest frozen, six gates green, 3-role approval, published, entitled, admitted, digest byte-equal listing → disclosure → admission) → REAL live session (5 NDJSON frames at 25ms cadence on an ephemeral port) → REAL run over the EXISTING run service with the REAL default-client model adapter. Regime-adaptive model-step assertions per the degradation law (above). THIS POD MEASURED THE HAPPY REGIME (twice, numbers below): the model step made a REAL network call (2306ms / 2301ms measured step latency across the two runs) and both real grades were pinned (live `real-local-live`, model `real`) with the real output revision committed through the artifact fabric.
  2. **W10C-1 / P10-16 degradation law (deterministic refused regime)** — the same composed lineage with the service's own 429 error class replayed at the adapter's injection seam: `fallback-used` recorded with the exact typed refusal, live grade still `real-local-live`, deterministic-node variant completed (trim step succeeded, carry-forward measured), NO real-model output claimed, and the model prompt proven to be the deterministic trim of the drained live frames.

## REAL EVIDENCE (commands and numbers measured on THIS sandbox)

- **Quota regime: HAPPY (available).** Pre-flight probe through the real SDK default path: latency **347ms**, the exact probe token returned (`SPORTA_W10C_REGIME_PROBE`). The composed slice then measured the happy regime on both runs: model step **2306ms** (first run) / **2301ms** (final-tree run), composed wall **2489ms / 2485ms** (test durations 2496ms / 2492ms), cost honestly null, grade `real` asserted, one real output revision. The station's prior 429 record (integration-log W10-B entry) did NOT reproduce on this pod — the quota window was open here; the refused arm is nonetheless proven deterministically by test 2, so the gate holds in either regime at re-measure time.
- **Admission byte-equality:** the admitted digest equals the listing digest and the disclosure digest (three pairwise assertions, all passing); the same digest is pinned into the run manifest's `release.releaseDigest` (asserted).
- **Live leg:** 5 frames consumed at the declared 25ms cadence, closeReason `completed`, the server binding released with the session (`activeBindings()` empty), the run's inputs pinned exactly like a fixture feed.
- **Gates on the final tree (branch `wave10/worker-c`):** architecture `OK / violations: 0 / baseline: 0 / new: 0`; surface check `OK — frozen surfaces intact, growth is additive-only` (transforms 31 frozen +51 additive, marketplace 16 +81, app-environments 14 +72; zero sporta-side changes this wave); `tsc -b packages/sporta-transforms packages/sporta-marketplace packages/sporta-app-environments packages/web` exit 0 (no output); lane test **2/2** in ~2.9s; web suite **22/22** (20 baseline + 2 new) in 6.1s; full battery **894/894** (872 sporta-* + 22 web), 0 fail, 0 skipped, 44.8s; lint **0 errors / 70 warnings** (identical to the base count; the new file alone lints 0 warnings / 0 errors); size law — zero `sporta-*` src files over 400 lines (largest: `listingService.ts` 398), no src file added this wave.

## FIXTURE EVIDENCE

- The marketplace stores are the repo's own labeled in-memory adapters (`InMemory*Store`, `FixtureManifestSource`, `FixtureSettlementAdapter`) — fixture-grade persistence behind the REAL services (the W9B/W10A composition precedent); the processes (digest freezing, check lane, review gates, publish, entitlement, admission ladder, disclosure) are REAL.
- The seed CONTENT is fixture: the composed manifest (synthetic digests, `SPORTA_HOST_POLICY`), the candidate content hashes/attestations, and the w10c reviewer identities (`reviewer:w10c-product/rights/security` — the review PROCESS is real, the reviewers are test fixtures; labeled in the test header).
- The artifact fabric is the in-memory lane (`ArtifactGraphService` + `InMemoryArtifactBlobStore`) — the liveIngressRun precedent for the live-run composition; revisions are real content-addressed commits through the port.
- Test 2's recording client is a labeled FIXTURE stand-in at the adapter's documented `SandboxChatCompletionClient` seam, replaying the real service's own HTTP 429 error class; the adapter, run service, live source, deterministic lane, and admission legs in that test are REAL; no fixture output is ever reported as real service evidence.

## CONTRACT CHANGES

NONE. The frozen `packages/sporta-*/src/contract.ts` surfaces are untouched — imported, never edited (the surface check confirms all frozen names intact, additive-only). No new refusal kinds, no new grades, no vocabulary changes: `real-local-live` and `real` are asserted only where the lanes are genuinely real, and a refused model call is never reported as real output (asserted negatively in the refused arms).

## RIGHTS-PROVENANCE

- No user data, personal data, or licensed third-party content enters this lane. The live frames are synthetic NDJSON events; the model prompt is the deterministic trim of those synthetic frames plus the adapter's fixed lane preamble; digests are synthetic sha256 constants; the pinned model ref (`glm-sandbox-summarizer @ sha256:7…`) is the W10B lane's synthetic pin over the sandbox service.
- The run outputs' provenance descriptors are the frozen run service's own (`agent-run` for the model lane, carried-forward/measurement for the deterministic lane) — never adapter-fabricated.
- The reviewer identities, rights snapshot, and entitlement principal are test fixtures over the REAL state machines.

## PERFORMANCE

- Composed-slice happy path (measured, this pod): model step 2301–2306ms (the REAL service's latency dominates), full composed wall 2485–2489ms (admission is in-memory + the live drain 5×25ms + the trim child process + the model call). Refused-regime test: 170ms total.
- Battery durations: lane 2.9s; web suite 6.1s; full battery 44.8s (the happy-path network call adds ~2.4s; in the refused regime at station re-measure the lane would run faster, not slower).
- The test adds no retries, no polling, no unbounded waits; the adapter's 30s deadline bounds the worst-case model leg.

## SECURITY

- The test imports the adapter (`packages/web` — the P10-18 placement law) and never imports `z-ai-web-dev-sdk` directly; the SDK client is constructed by the adapter's default path, which reads service credentials from the environment's SDK config at CALL time — credentials never appear in code, tests, logs, or this report.
- The model node's sandbox envelope declares `networkEgress: "denied"` + `hostSecretAccess: false` (the studio-envelope precedent): the adapter's network call is a HOST-layer leg through the injected port, never a node-level egress grant.
- No new process spawning beyond the deterministic lane's existing pinned child process; no filesystem writes (the in-memory lane); no env-var switches — the regime is detected from the invocation result, never configured.

## RISKS

- **Station re-measure depends on the live quota window:** test 1 exercises whichever regime the service returns; both arms are complete assertion sets, and the refused arm is ADDITIONALLY pinned deterministically by test 2, so a 429 at station time flips test 1 to the refused regime (a valid, fully-asserted pass) rather than breaking the gate. The happy-path real-grade pinning re-verifies whenever the quota window is open (the P10-16 audit-time doctrine).
- **Model non-determinism:** the happy arm asserts grade/label/latency/cost/revision shape, never exact completion content — a paraphrased summary passes; the probe token was observed returned but is not asserted.
- **Latency variance:** the real model step measured ~2.3s on this pod (the W10B record saw 360ms–6.8s); the assertions bound only `timingMs > 0`, and the adapter's 30s deadline bounds the tail.
- **Battery-count platform delta (known class):** this pod measures 872 sporta-* tests at base 900680a vs the station's recorded 873 at the W10-A merge entry — the same 1-test measurement/platform delta class w10b recorded (DEVIATIONS 1 there); flagged for the TL's re-run, not a missing test.

## BLOCKERS

None. (Recorded for completeness: pnpm required a corepack-prepared shim directory on this box — environmental setup only, no repo change; the clone used the packet's token URL verbatim.)

## DEVIATIONS

1. **A second test beyond the packet's single adaptive slice.** The packet's quota-degradation law requires the slice to pass in BOTH regimes; a single adaptive test can only ever MEASURE one regime per run. Test 2 deterministically proves the refused arm through the adapter's documented injection seam (the W10B recording-client precedent, replaying the service's own 429 error class) so the degradation law is evidenced at ANY station quota state. The client seam is the only fixture element and is labeled as such; every other leg of test 2 is the same REAL composed lineage. Both tests live in the packet's single file.
2. **No additive host seam was needed.** The packet anticipated a possible ADDITIVE `packages/web/src/**` composition gap; none existed — the W10B-4 injection pattern, the W10A live-run composition, and the W9B marketplace services compose directly. Zero src edits anywhere.
3. **The test file is 512 lines (> 400).** The file-size law (`< 400 lines per src file`, enforced by the battery's `find packages -name "*.ts" -path "*/src/*"` command) governs src files; this wave adds ZERO src files and zero sporta-* files change (largest sporta src file remains 398). The packet's "ONE test file" law concentrates three lanes (full marketplace lifecycle + live ingress + model-adaptive run) plus the deterministic refused-regime proof in a single file; splitting it would violate the one-file requirement. Disclosed here rather than silently accepted.
4. **Battery-count delta (the w10b DEVIATIONS-1 class):** this pod measures 872 sporta-* at base 900680a (station's W10-A entry recorded 873) and 22 web (20 baseline + 2 new). Total 894/894. The 1-test sporta-side delta is a platform/measurement difference recorded for the TL's re-measure, not a missing test.

## NEXT DEPENDENCIES

- **P10 acceptance audit (TL):** with the P10-16 composed slice landed, the remaining P10 item is the 18-gate audit on the integration SHA (P10-07's happy path and P10-16's happy arm re-verify together when the account quota window is open at the station; the refused arms are already deterministic).
- **No open seams from this lane:** the composed slice closes the W10B NEXT-DEPENDENCIES item 2 (the P10-16 vertical slice) — both halves are now composed in one lineage with both grades pinned.

DELIVERY: branch wave10/worker-c (single commit: the composed-slice test + this report; base 900680a; pushed to payswapdotorg/Sporta-2.0; pnpm-lock.yaml and every package manifest untouched — verified by the empty diff).

Gate table (real, measured on this sandbox; final tree = the wave10/worker-c commit):

| Gate | Command | Result |
|---|---|---|
| Architecture | node scripts/architecture/architecture-check.mjs check | OK — violations 0, baseline 0, new 0 |
| Surface | node scripts/architecture/sporta-surface-check.mjs | OK — frozen surfaces intact, additive-only (zero sporta-side changes this wave) |
| Typecheck | pnpm exec tsc -b packages/sporta-transforms packages/sporta-marketplace packages/sporta-app-environments packages/web | exit 0, no output |
| Tests (lane, NEW) | pnpm exec tsx --test packages/web/test/composedSlice.test.ts | 2 pass / 0 fail, 2.9s — HAPPY regime measured (REAL model step 2306ms / 2301ms across two runs, wall 2489ms / 2485ms, both real grades pinned) + the deterministic refused-regime proof (170ms) |
| Tests (web) | pnpm exec tsx --test packages/web/test/*.test.ts | 22 pass / 0 fail (20 baseline + 2 new), 6.1s |
| Tests (full battery) | pnpm exec tsx --test packages/sporta-*/test/*.test.ts packages/web/test/*.test.ts | 894 pass / 0 fail / 0 skipped (872 sporta-* + 22 web; the station's prior entries recorded a 1-test sporta-side delta on this platform class), 44.8s |
| Lint | pnpm lint | 0 errors, 70 warnings (identical to base — the new file contributes 0/0) |
| Size law | find packages -name "*.ts" -path "*/src/*" \| xargs wc -l \| awk '$1 > 400 && $2 != "total"' | zero sporta-* matches (largest sporta src: 398); the non-sporta matches are the pre-existing vendored ZCode substrate, unchanged at base; this wave adds no src file |
| Quota regime | W10C-1 slice test | HAPPY measured (probe 347ms exact-token; model step 2306ms / 2301ms over two runs); the refused arm proven deterministically by test 2 — the gate holds in both regimes |
