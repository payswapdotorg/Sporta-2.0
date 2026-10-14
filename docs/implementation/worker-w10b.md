# Worker W10B Implementation Report

Worker: w10b (Wave 10, Worker B lane — P10 real model provider + typed-future documentation)

Status: WAVE 10 WORKER B IMPLEMENTED (branch `wave10/worker-b`, commits `692bc7d` spec (SPEC-first) → `031932d` implementation (code + tests + typed-future docs + the SDK dependency wiring) → this report as the branch HEAD rider).

Scope: the REAL model-provider lane at the sandbox grade. A REAL `TransformModelPort` adapter over `z-ai-web-dev-sdk` (providerId `zai:glm-sandbox`, grade `real`, label `real sandbox model service`), typed refusals on every failure lane (outage never fabricates, never silently becomes fixture — ADR rule 14), measured latency, honest cost, port conformance against the fixture adapter's behavioral contract, one REAL network invocation test (labeled), a REAL port-injection run through the frozen run service, and the three typed-future documentation files (payment / HF / hosted-preview probe). ZERO edits to any `packages/sporta-*` source; ZERO edits to transforms/marketplace/studio/composition files; the only non-provider file touched is the web package manifest + lockfile (the SDK dependency registration the ADR placement law itself directs).

## WORK ITEMS

- **W10B-1 — `packages/web/src/sporta/providers/sandboxModelAdapter.ts` (NEW, 307 lines)** — `SandboxModelAdapter implements TransformModelPort` (imported from `@sporta/transforms/contract`, never edited):
  - Identity (P10-09): `providerId: "zai:glm-sandbox"`, `evidenceGrade: "real"`, label `real sandbox model service` (exported as `SANDBOX_MODEL_PROVIDER_LABEL`, carried in every success `detail`, asserted exact by tests).
  - REAL invocation: one chat-completion call per `invokeModel` through the injected `SandboxChatCompletionClient` seam (narrow, self-typed — this file owns no SDK type); the DEFAULT path lazily constructs the REAL client via `ZAI.create()` (`z-ai-web-dev-sdk`, resolved at 0.0.18 from this environment). Messages = declared lane system message + the port's prompt verbatim; `thinking: {type: "disabled"}`; parameter pass-through minimal and declared (string `parameters.model` only, never fabricated).
  - Latency: MEASURED (`Date.now()` delta from method entry — the fixture adapter's exact measurement point), never estimated.
  - Cost: honestly `null` unless the service response carries a machine-readable `{amount, currency}` object (then verbatim); token `usage` surfaces in `detail` as evidence, never as cost.
  - Wall-clock deadline: `deps.timeoutMs` (default 30 000, positive-finite validated) raced via `AbortSignal.timeout` (verified empirically not to hold the event loop); no unbounded wait.
  - Typed refusals — the packet's four lanes mapped onto the FROZEN five-kind set (mapping documented in SPEC.md; the frozen contract defines no additive kinds, so none were added): unreachable → `provider-unavailable` (original error retained); timeout → `provider-unavailable` ("timed out after Nms"); malformed response → `unsupported-operation` (shape-validated extraction: non-object / no choices / no usable content string); content refusal → `policy-denied` (SIGNAL-based only: `finish_reason === "content_filter"` or string `message.refusal` — never guessed from output text). Plus honest classifications of real SDK failure modes: SDK config-missing → `credentials-missing`; HTTP 401/403 → `credentials-missing`; 429 → `quota-exhausted`; 400/422 → `unsupported-operation`; any other thrown error → `provider-unavailable`.
  - Outage law (ADR rule 14): `evidenceGrade` stays `"real"` on refusals (asserted); output null; no fixture downgrade; caller-side fallback stays the run service's declared-fallback lane, never adapter behavior.
- **W10B-2 — `packages/web/test/sandboxModelAdapter.test.ts` (NEW, 311 lines)** — 9 tests, node:test + node:assert/strict via `pnpm exec tsx --test` (the project law; no new framework; no test-only switches in src). Details in TESTS below.
- **W10B-3 — typed-future documentation (all in the lane root, P10-10):**
  - `PAYMENT-TYPED-FUTURE.md` — the operator key request; the EXACT `SettlementPort` seam (`authorize(TransformSettlementRequest) → TransformSettlementResult`, idempotent per key, the frozen five refusal kinds, `settlementIdempotencyKeyPreimage`); fixture settlement stays until keys exist; the placement-doctrine precedent; NO implementation claimed.
  - `HF-TYPED-FUTURE.md` — the operator token request; the exact pinning/storage doctrine (`TransformPinnedDependency` digest-is-identity, `storageRef` = bytes-host-never-authority, resolution through `TransformComponentResolverPort`, never a moving tag); NO implementation claimed.
  - `HOSTED-PREVIEW-PROBE.md` — the Vercel feasibility record AS OBSERVED from this sandbox (measurements in REAL EVIDENCE below) + the P11 proposal (operator-confirmation-gated; the honesty constraint that a static host serves the fixture-grade browser route by construction); NO deployment performed or claimed.
- **SDK dependency wiring (the ADR placement law / P10-18):** `z-ai-web-dev-sdk@^0.0.18` added to the WEB package's dependencies ONLY; `pnpm install` registered it in the lockfile (+10 lines, SDK-only diff verified). The frozen `@sporta/transforms` package stays external-dep-free (zero sporta-* file edits). tsconfig needed NO edit (the providers root is inside `src/`, already compiled — verified by `tsc -b packages/web` exit 0).

## CHANGED FILES

All inside the owned boundary `packages/web/src/sporta/providers/**` + `packages/web/test/` + the web manifest/lockfile wiring + this report. ZERO edits to any `packages/sporta-*` source, zero frozen-contract edits, zero composition/studio/boot edits.

- packages/web/src/sporta/providers/SPEC.md (NEW, 161 lines — committed FIRST, 692bc7d, SPEC-first law)
- packages/web/src/sporta/providers/sandboxModelAdapter.ts (NEW, 307 lines)
- packages/web/src/sporta/providers/PAYMENT-TYPED-FUTURE.md (NEW, 66 lines)
- packages/web/src/sporta/providers/HF-TYPED-FUTURE.md (NEW, 67 lines)
- packages/web/src/sporta/providers/HOSTED-PREVIEW-PROBE.md (NEW, 56 lines)
- packages/web/test/sandboxModelAdapter.test.ts (NEW, 311 lines)
- packages/web/package.json (M, +1 dependency line: the SDK, web-package-only placement law)
- pnpm-lock.yaml (M, +10 lines: the SDK registration — the mechanical, verified-SDK-only consequence of the manifest wiring; see DEVIATIONS 2)
- docs/implementation/worker-w10b.md (NEW, this report)

## TESTS

Runner: `pnpm exec tsx --test` (node:test + node:assert/strict — the project law). 9 new tests, all passing, clean teardown (no temp dirs needed; recording clients are in-memory). EVIDENCE CLASS labeled in each test name.

- packages/web/test/sandboxModelAdapter.test.ts (9):
  1. **W10B-1 port conformance** — the sandbox adapter (recording client, success) and the REAL `FixtureTransformModelAdapter` run through the SAME `assertPortLaw` behavioral assertions (P10-06): all seven output fields typed, output XOR refusal, cost null on refusals, timing finite ≥ 0, grades "real"/"fixture" honest per adapter; plus the actual sent request pinned (system lane message + the port's prompt VERBATIM as the user payload, thinking disabled, no fabricated model parameter).
  2. **W10B-1 honest labels + cost law** (P10-09) — `providerId === "zai:glm-sandbox"`, `evidenceGrade === "real"`, label string exact, detail shape exact; cost null when unreported, VERBATIM when the service reports `{amount, currency}` (deep-equal), null when the cost field is not machine-readable; service-reported `usage` surfaces in detail only.
  3. **W10B-2 refusal lane (unreachable)** — thrown network error → typed `provider-unavailable`, original error text retained, output null (never fabricated), grade stays "real" (the outage law, asserted), cost null.
  4. **W10B-2 refusal lane (timeout)** — hung client (never settles) + 60ms deadline → typed `provider-unavailable` "timed out after 60ms"; timingMs ≥ 55 (MEASURED — the real deadline was actually waited) and < 5000 (bounded).
  5. **W10B-2 refusal lane (malformed)** — four unusable shapes (string response / no choices / no message / empty content without filter signal) → typed `unsupported-operation` with the malformed detail signature.
  6. **W10B-2 refusal lane (content refusal)** — service-declared filter (`finish_reason: "content_filter"` + `message.refusal`) → typed `policy-denied`; the negative case pinned (missing content WITHOUT a declared signal is malformed, never a guessed refusal).
  7. **W10B-2 refusal classification** (additive beyond the four required lanes) — SDK config-not-found → `credentials-missing`; HTTP 401 → `credentials-missing`; 429 → `quota-exhausted`; 400 → `unsupported-operation`; 503 → `provider-unavailable`; original error text always retained.
  8. **W10B-3 REAL network invocation through the real z-ai-web-dev-sdk client** (labeled REAL) — the DEFAULT construction path (no client injected → lazy `ZAI.create()`); a real completion over the network: grade real asserted, refusal null, output non-empty, timingMs > 0 (measured), cost null (honest — the service reports no monetary cost), detail carries the exact label + model pin. Egress from this sandbox CONFIRMED (no skip needed): measured cold 6843.665ms / warm 360.950ms; the real service returned exactly the requested probe token (logged).
  9. **W10B-4 port injection** (additive; P10-16's lane-B half) — the REAL frozen `TransformRunService` executes a one-node model pipeline with THIS adapter injected as `models` (the ONLY seam the run service sees): the model step makes a REAL network call, succeeds with MEASURED step timing (~280–288ms), cost null, step detail `real sandbox model service (labeled real; model … @ sha256:…)`, one output revision committed through the real artifact fabric (`rev:`-prefixed), output semantic evidence `real model lane: real sandbox model service`, manifest `semanticFidelity.grade: "declared"` (honest — a real model lane claims no preservation measurement), ledger read-back deep-equal. The node's sandbox envelope follows the studio precedent (`networkEgress: "denied"` — the adapter's network call is a host-layer leg through the injected port, the arena-HTTP-leg class; the plan resolver default-denies `allowlisted`).

## REAL EVIDENCE (commands and numbers measured on THIS sandbox)

- **REAL model-service invocation** (the W10B-3 test, through the real SDK default path):
  - cold: latency **6843.665ms** (includes lazy `ZAI.create()` + TLS + first completion), output exactly `"SPORTA_W10B_REAL_PROBE"`, cost null, `usage` reported by the service (surfaced in detail, never as cost).
  - warm (re-run): latency **360.950ms**, same probe token.
  - pre-implementation egress probe (from this sandbox, same host): `status: ok`, latency 408ms, content `"SPORTA_W10B_PROBE_OK"`, `usage: {"completion_tokens":9,"prompt_tokens":43,"total_tokens":52}`.
  - SDK resolution: `pnpm view z-ai-web-dev-sdk version` → `0.0.18` (registry-resolvable from this environment, as the ADR records); service configuration resolved by the SDK at `/etc/.z-ai-config` (baseUrl `https://internal-api.z.ai/v1`, apiKey present — never echoed).
- **W10B-4 port-injection run:** model step timing **288.306ms** (first) / **279.712ms** (re-run); step status `succeeded`; output semantic evidence `real model lane: real sandbox model service (labeled real; …)`.
- **Vercel control-plane probe** (for HOSTED-PREVIEW-PROBE.md, measured 2026-10-14T14:30:12Z): `https://vercel.com` → HTTP 200 in 0.095s (DNS 0.0016s, TLS 0.019s); `https://api.vercel.com/v2/user` → HTTP 403 in 0.479s (unauthenticated — NO Vercel token exists in this worker's environment; the 403 is the correct unauth answer, not an outage; the ADR's account-owner authentication claim is the TL's station observation, cited as such, not re-measured here); `https://vercel.com/api/web/telemetry` → HTTP 404 in 0.209s (routes). Reachability: CONFIRMED at the unauthenticated grade.
- **Timeout mechanism check (empirical):** `AbortSignal.timeout(3000)` pending → process exited in 4ms (the deadline race never holds the event loop; battery duration unaffected).
- **Gates on the final tree (031932d):** architecture `OK / violations: 0 / baseline: 0 / new: 0`; surface check `OK — frozen surfaces intact, growth is additive-only` (transforms 31 frozen names, zero sporta-side changes); `tsc -b packages/web` exit 0; web suite 20/20 in 2.59s; full battery **875/875** in 39.17s; lint **0 errors / 70 warnings** (identical to the base count — this wave adds zero warnings).

## FIXTURE EVIDENCE

- The recording clients in tests 1–7 (the `RecordingClient` stand-in behind the injected seam) are labeled FIXTURE in the test-file header and per-test names: they stand in for the service ONLY on the conformance/label/refusal lanes; the ADAPTER under test is the real one and no recording-client output is ever reported as real service evidence.
- The fixture adapter invoked in the conformance test is the repo's own labeled `FixtureTransformModelAdapter` (grade "fixture", cost null — asserted as such).
- The W10B-4 pipeline manifest, feed bytes, and pinned digests are test-fixture CONTENT (synthetic sha256 digests, synthetic policy from `SPORTA_HOST_POLICY`); the run service, plan resolver, validator, artifact fabric, and the model call itself are REAL.
- The Vercel probe is a reachability record only — no deploy, no token, no claim.

## CONTRACT CHANGES

NONE. The frozen `@sporta/transforms` contract (and every other `packages/sporta-*` contract) is untouched — imported, never edited. Surface check: all frozen names intact, growth additive-only; zero `packages/sporta-*` files appear in this wave's diff. No new refusal kinds were invented (the frozen five-kind set is used as-is; the packet's four lanes map onto it per SPEC.md).

## RIGHTS-PROVENANCE

- No user data, personal data, or licensed third-party content enters this lane. Test prompts are synthetic tokens (`SPORTA_W10B_REAL_PROBE` etc.); test digests are synthetic sha256 constants; the W10B-4 feed is a synthetic instruction string.
- The W10B-4 run's output provenance is the run service's own `model:<name>` agent-run descriptor (the frozen service's behavior, not adapter-fabricated).
- The typed-future docs claim no rights, no implementations, and no third-party artifacts.

## PERFORMANCE

- Real invocation latency (measured, this sandbox): cold 6843.665ms / warm 360.950ms — REAL service latency variance recorded honestly, never smoothed. The adapter adds no retries, no queuing, no second runtime; one call per invocation; the deadline race is O(1).
- Battery durations: web suite 2.59s (11 baseline tests 1.60s → 20 tests with two REAL network calls); full battery 39.17s (baseline 40.50s — within run-to-run variance; the timeout test adds ~60ms).
- File sizes: adapter 307 lines (< 400 cap); test 311 lines; SPEC 161; typed-future docs ≤ 67.

## SECURITY

- The SDK reads service credentials from `/etc/.z-ai-config` (root-owned, mode 0444) at CALL time — credentials never appear in code, tests, manifests, logs, or this report (verified: the only config echo is baseUrl + apiKey-presence boolean).
- The adapter sends exactly the port's prompt + a fixed lane preamble to the sandbox-internal service; no host secrets, no secret access (the W10B-4 node envelope: `hostSecretAccess: false`, `networkEgress: "denied"` at the node level; the adapter's egress is the host-layer injected leg).
- Refusal details retain original error text — screened to contain no credentials (error messages carry status codes and hostnames only; the 401 test body is a synthetic error string).
- No new process spawning, no filesystem writes, no env-var switches in the adapter; the deadline mechanism is `AbortSignal.timeout` (no raw timers).

## RISKS

- **Station re-run dependence on live egress:** W10B-3/W10B-4 make REAL network calls; if the sandbox model service is unavailable at station re-measure time, those two tests fail honestly (the adapter would return typed refusals — the refusal lanes themselves prove outage typing). This is an environmental dependency, not a code defect; the packet's skip-with-reason path was NOT needed (egress confirmed and exercised).
- **Model non-determinism:** W10B-3/W10B-4 assert non-empty output, grade, latency, cost — never exact content (the probe token was observed obeyed and is logged, but a paraphrase would not fail the suite).
- **Timeout margin:** the timeout test asserts ≥ 55ms against a 60ms deadline (5ms jitter margin) and < 5s; under extreme scheduler load the lower bound could theoretically flake — margin deemed safe (measured 59.8ms).
- **Cold-start latency** (6.8s observed once) could lengthen station batteries marginally; the deadline default (30s) bounds it.

## BLOCKERS

None. (Recorded for completeness: pnpm required a corepack-prepared wrapper on this box — environmental setup only, no repo change; the first `pnpm install` reported exit 2 mid-link but completed the lockfile registration, verified by the SDK-only lockfile diff and a working import.)

## DEVIATIONS

1. **Baseline battery count (1-test delta, the w10a DEVIATIONS-4 class).** The packet's station baseline says "battery 856/856 + web 3/3 + studio 8/8" (= 867); THIS sandbox measures at clean base 3ddf4d0: **855** sporta-* + **11** web = **866** (0 skipped, 0 fail, re-measured). My additive total: **875/875** (866 + 9). The delta is a measurement/platform difference, not a missing test — flagged for the TL's re-run.
2. **pnpm-lock.yaml edited (+10 lines).** The packet's scope law lists "package.json/tsconfig wiring"; the ADR placement law explicitly directs `z-ai-web-dev-sdk` as a dependency of the WEB package — unlike w10a's gitignored-symlink bridge, the dependency registration here REQUIRES the lockfile entry (this repo's `node-linker: hoisted` resolves it from the root). The diff is verified SDK-only (importer entry + resolution + snapshot). Recorded as the minimal wiring the placement law itself directs.
3. **Two additive tests beyond the packet's five-item list.** The packet lists conformance / four refusal lanes / REAL invocation / latency / labels; I added (a) the credentials/HTTP-status classification test (the SDK's own real failure modes — same frozen kind set) and (b) the W10B-4 port-injection run (P10-16's lane-B half: proves the adapter slots into the REAL frozen run service through `models`, producing real manifest evidence). Both are documented in SPEC.md §7 (items 7 and 9) — SPEC-first, no scope creep into other files.
4. **tsconfig needed NO edit.** The packet anticipated "tsconfig wiring"; the providers root sits inside `src/` which the web tsconfig already includes — verified by `tsc -b packages/web` exit 0 with zero tsconfig changes.
5. **No host-composition injection shipped.** The ADR authority map says the adapter "is injected by host composition"; my packet's scope law explicitly forbids composition/studio edits ("beyond the wiring the new dir needs to typecheck" — it needs none). The adapter ships as an injectable port implementation (W10B-4 proves injectability against the real consumer); the product composition wiring belongs to the TL/station — see NEXT DEPENDENCIES.

## NEXT DEPENDENCIES

- **Host composition injection (TL/station decision):** `packages/web/src/sporta/composition.ts` (or the station's serialization step) may wire `models: new SandboxModelAdapter()` into future `TransformRunService` constructions (studio composition currently pins the fixture adapter on its sample run — an intentional W10A decision; switching it is a station policy call, not this lane's).
- **P10-16 vertical slice (cross-lane, station):** compose lane A's live source through admission into a run whose model node uses this adapter — the lane-B half is proven by W10B-4; the live-source half lands with lane A's serialization.
- **Operator key requests stand:** payment provider credentials (PAYMENT-TYPED-FUTURE.md), HF token (HF-TYPED-FUTURE.md), Vercel deployment confirmation (HOSTED-PREVIEW-PROBE.md / P11) — all typed-future, none claimed.

DELIVERY: branch wave10/worker-b @ 031932d (spec commit 692bc7d precedes it; implementation commit 031932d carries code + tests + typed-future docs + SDK wiring; this report is the branch HEAD rider; pushed to payswapdotorg/Sporta-2.0)

Gate table (real, measured on this sandbox; final tree = 031932d):

| Gate | Command | Result |
|---|---|---|
| Architecture | node scripts/architecture/architecture-check.mjs check | OK — violations 0, baseline 0, new 0 |
| Surface | node scripts/architecture/sporta-surface-check.mjs | OK — frozen surfaces intact, additive-only (zero sporta-side changes this wave) |
| Typecheck | pnpm exec tsc -b packages/web | exit 0, no output |
| Tests (lane, NEW) | pnpm exec tsx --test packages/web/test/sandboxModelAdapter.test.ts | 9 pass / 0 fail (7 recording-lane + 2 REAL network) |
| Tests (web) | pnpm exec tsx --test packages/web/test/*.test.ts | 20 pass / 0 fail (11 baseline + 9 new), 2.59s |
| Tests (full battery) | pnpm exec tsx --test packages/sporta-*/test/*.test.ts packages/web/test/*.test.ts | 875 pass / 0 fail / 0 skipped (base 866 on this sandbox: 855 sporta-* + 11 web; TL station record said 867 — see DEVIATIONS 1), 39.17s |
| Lint | pnpm run lint | 0 errors, 70 warnings (identical to base — zero new warnings) |
| Size law | wc -l on new sources | adapter 307 / SPEC 161 / docs ≤ 67 — all < 400 |
| REAL invocation | W10B-3 test | measured latency (cold 6843.665ms / warm 360.950ms), output real, cost null, grade real — egress confirmed, no skip needed |
