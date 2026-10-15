# W12 Worker A — Implementation Report

**Worker:** w12a
**Base SHA:** 571fd1b (W12 Wave 0 freeze)
**Branch:** wave12/worker-a
**Commits:**
- `3a55586` — `w12a spec: the runs + library REAL hosts (SPEC-first)`
- `21d9b47` — `w12a: runs/library REAL hosts over the REAL services + the gated export seam`
**Authority order followed:** w12 work-orders → adr-w12-composition-seams → w12-acceptance → sporta-work-orders → runs/library screen-ports (FROZEN) → runs/library fixture hosts → runs/library screen-views → sporta-transforms/contract.ts (TransformRunService W12-01) → sporta-artifacts/contract.ts (ArtifactGraphService W12-02 + ArtifactGatedReadService) → sportaScreens.test.ts (W11C precedent) → SCREEN-PORTS.md.

## WORK ITEMS

- **W12A-1** — `createRunsRealHost(deps: { service: TransformRunService; workspace?: string }): RunsRealHost` — the runs screen REAL host (composition-grade). A pure projection over the REAL TransformRunService ledger: `listRuns()` calls `service.listRuns()` (the W12-01 freeze enumeration read); `readRun(id)` calls `service.readRun(id)` and throws a typed `Error` with the verbatim refusal reason for unknown ids (the fixture-host law). Every `TransformRunManifest` field projects verbatim through the frozen `RunRecordShape` mirror (runManifestId, workGraph, release, componentDigests, configHash, inputs, grantedApplicationCapabilities, steps, outputs, semanticFidelity, startedAt, finishedAt, retention). The optional `liveSessions` is forward-compatible: a structural probe carries them when the manifest type exposes them (base manifests don't; the live-ingress `LiveTransformRunManifest` does — additive, no cross-lane import).
- **W12A-2** — `createLibraryRealHost(deps: { graph: ArtifactGraphService }): LibraryRealHost` — the library screen REAL host. A pure projection over the REAL ArtifactGraphService registry: `listArtifacts()` calls `graph.listArtifacts()` (the W12-02 freeze enumeration read); `readArtifact(id)` calls `graph.readArtifact(id)` and throws a typed `Error` for unknown ids, then `graph.lineage(id)` for the immutable revision chain ROOT-FIRST (the Library law). The `lineageNote` is a pure projection over the real provenance chain (the unique `<sourceKind>:<sourceRef>` pairs in chain order). Editability classes (editable / derived-only / opaque) carry verbatim — never re-badged.
- **W12A-3** — `exportRevisionContent(deps: { gated: ArtifactGatedReadService; usage?: ArtifactReadUsageContext }): (revisionId) => Promise<ExportRevisionContentOk | ScreenRefusal>` — the artifact-content/export read seam. A curried read closure: takes deps, returns the read function. The closure reads the revision record via `gated.readRevision` (gets the trusted contentHash), then the content bytes via `gated.readRevisionContent` (the store verifies bytes ↔ contentHash on read), and returns `{ bytes, contentHash: revision.contentHash }`. The gate runs FIRST (rights then retention) — a prohibited or retention-expired content read NEVER reaches the blob store. Every typed gate error (ArtifactRightsRefusalError / ArtifactRetentionExpiredError / ArtifactReadUnavailableError / ArtifactBlobNotFoundError / ArtifactIntegrityError) is caught and translated into a `ScreenRefusal` with the gate's verbatim message. The seam NEVER re-hashes-and-claims — the contentHash is taken from the revision record, never recomputed from the bytes.

## CHANGED FILES

All additive (no edits to any existing file):

| File | Status | Lines | Law |
|---|---|---|---|
| `packages/web/src/sporta/runs/SPEC.md` | NEW | 220 | SPEC-first (committed separately before code) |
| `packages/web/src/sporta/runs/runsRealHost.ts` | NEW | 223 | < 400 line cap |
| `packages/web/src/sporta/library/libraryRealHost.ts` | NEW | 200 | < 400 line cap |
| `packages/web/src/sporta/library/libraryExportSeam.ts` | NEW | 156 | < 400 line cap |
| `packages/web/test/sportaSeamsRuns.test.ts` | NEW | 525 | W12A-1 battery (8 named tests) |
| `packages/web/test/sportaSeamsLibrary.test.ts` | NEW | 624 | W12A-2 + W12A-3 battery (11 named tests) |
| `docs/implementation/worker-w12a.md` | NEW (this file) | — | standard report |

ZERO edits to: `product/app.tsx`, `marketplace/`, `apps/`, `studio/`, the `sporta-*` service packages, `package.json`, the lockfile, the frozen `runsScreenPorts.ts` / `libraryScreenPorts.ts`, the `runsFixtureHost.ts` / `libraryFixtureHost.ts` (siblings retained), `runsScreenViews.ts` / `libraryScreenViews.ts` (pure views, untouched), `architecture-policy.yaml`, `.architecture-baseline.json`.

## TESTS

### New lane tests (19, all named, all REAL)

`sportaSeamsRuns.test.ts` (8 tests):

| # | Test name | Gate | Evidence |
|---|---|---|---|
| 1 | `W12A-1 runs REAL host: backing real + the ledger honesty grade note surfaces (W12-07)` | W12-07 | the gradeNote is the exact `"BACKING: REAL (ledger: fixture-grade in-memory)"` string |
| 2 | `W12A-1 runs REAL host: a REAL deterministic run projects through the host (W12-05)` | W12-05 | REAL child-process trim step (real carry-forward re-verification); listRuns/readRun agree; manifest fields verbatim |
| 3 | `W12A-1 runs REAL host: readRun refuses typed for an unknown run (W12-05 refusal law)` | W12-05 | the typed refusal carries the verbatim reason + the workspace label |
| 4 | `W12A-1 runs REAL host: a REAL typed model refusal projects the typed-failure state verbatim (W12-06)` | W12-06 | the typed-failure step status carries verbatim — never softened |
| 5 | `W12A-1 runs REAL host: a REAL declared-fallback model refusal projects fallback-used verbatim (W12-06)` | W12-06 | the declared fallback mode is honored — never relabeled |
| 6 | `W12A-1 runs REAL host: multiple REAL runs project through the host in ledger order` | W12-05, W12-06 | 3 REAL runs (succeeded/typed-failure/fallback-used) surface honestly in ledger order; readRun agrees for each |
| 7 | `W12A-1 runs REAL host: the ledger honesty label is the documented exact string (W12-07)` | W12-07 | the exact string; never re-badged; no `production` inflation |
| 8 | `W12A-1 runs REAL host: the labeled fixture host stays for the browser demo (sibling, not replacement)` | — | the fixture host stays with `backing: "fixture"`; the REAL host is a composition-grade sibling |

`sportaSeamsLibrary.test.ts` (11 tests):

| # | Test name | Gate | Evidence |
|---|---|---|---|
| 9 | `W12A-2 library REAL host: backing real + the registry honesty grade note surfaces (W12-07 generalized)` | W12-07 | the gradeNote is the exact `"BACKING: REAL (registry: fixture-grade in-memory)"` string |
| 10 | `W12A-2 library REAL host: REAL committed revisions project through the host root-first (W12-08)` | W12-08 | 3 REAL revisions (real sha-256 content hashes); root-first lineage; chain preserved; view-models mark head correctly |
| 11 | `W12A-2 library REAL host: multiple REAL artifacts surface in registry order; editability classes honest (W12-08)` | W12-08 | 3 artifacts (editable/derived-only/opaque) in registry order; an artifact with no revisions surfaces honestly (empty chain, null lineageNote) |
| 12 | `W12A-2 library REAL host: readArtifact refuses typed for an unknown artifact (W12-08 refusal law)` | W12-08 | the typed refusal carries the verbatim reason — never a fabricated lineage |
| 13 | `W12A-2 library REAL host: the labeled fixture host stays for the browser demo (sibling, not replacement)` | — | the fixture host stays; the REAL host is a composition-grade sibling |
| 14 | `W12A-3 export seam: the gate-allowed arm returns bytes that re-hash to the committed contentHash (W12-09)` | W12-09 | REAL bytes through the gated read; the test re-hashes and verifies `sha256(bytes) === contentHash` |
| 15 | `W12A-3 export seam: the gate-refused arm returns a typed ScreenRefusal with the verbatim reason (W12-09)` | W12-09 | a prohibited usage context refuses with the gate's verbatim `ArtifactRightsRefusalError` message |
| 16 | `W12A-3 export seam: a bare usage context fails closed into a typed ScreenRefusal (W12-09 fail-closed law)` | W12-09 | no usage context ⇒ fail-closed ⇒ typed ScreenRefusal (the wave-4 law) |
| 17 | `W12A-3 export seam: an unknown revision id returns a typed ScreenRefusal (honest absence)` | W12-09 | honest null for unknown revision — never a fabricated record |
| 18 | `W12A-3 export seam: no blob store wired → typed ScreenRefusal (the gate's capability-unavailable law)` | W12-09 | `ArtifactReadUnavailableError` translated to ScreenRefusal with the verbatim reason |
| 19 | `W12A-3 export seam: the gate NEVER bypasses — a prohibited read does NOT touch the blob store` | W12-09 | the rights gate refuses BEFORE any storage touch; the blob-store messages are absent from the refusal reason |

### Battery totals (additive on top of baseline)

| Battery | Baseline @ 571fd1b (TL) | Baseline @ 571fd1b (this agent) | After w12a (this agent) |
|---|---|---|---|
| architecture-check | 0 violations | 0 violations | 0 violations |
| sporta-surface-check | OK additive-only | OK additive-only | OK additive-only |
| scoped tsc -b packages/web | exit 0 | exit 0 | exit 0 |
| Full sporta-* battery (`packages/sporta-*/test/**/*.test.ts`) | 882 pass / 0 fail | 882 pass / 0 fail | 882 pass / 0 fail (unchanged — no service-package edits) |
| Web test suite (`packages/web/test/*.test.ts`) | 83 pass + 2 honest quota-429 fails (documented) | 85 pass / 0 fail (the 2 W10B quota tests succeeded this run — the rate-limit window was not hit) | **104 pass / 0 fail** (85 baseline + 19 new lane tests; the 2 W10B quota tests still succeed this run) |
| Lane tests (`packages/web/test/sportaSeams*.test.ts`) | n/a | n/a | **19 pass / 0 fail** |
| Lint | 0 errors / 70 warnings | 0 errors / 70 warnings | 0 errors / 70 warnings (no new lint issues introduced) |

**Note on the W10B quota-429 discrepancy:** the TL baseline stated "83 pass + 2 honest quota-429 fails" at 571fd1b. My measurement at the same SHA shows "85 pass / 0 fail" — the 2 W10B tests (`sandboxModelAdapter.test.ts` W10B-3 + `composedSlice.test.ts` W10C-1) succeeded in this sandbox because the rate-limit window was not hit on this run. The total test count is unchanged (85 in baseline, 85 after my changes excluding the new lane tests). The 2 W10B tests MAY fail with 429 quota refusals on a future run (the documented honest state per the work order) — recorded, not "fixed".

## REAL EVIDENCE

- **W12-05 (REAL run through the REAL host):** the W11C `makeRuns` precedent is reused — a REAL `TransformRunService` with a REAL deterministic-filter child process (the `jsonEventStreamTrimComponent` on real pipes), REAL carry-forward re-verification in-process, a REAL in-memory blob store that verifies bytes ↔ contentHash on every read. The REAL run assembles one manifest; `host.listRuns()[0]` and `host.readRun(manifestId)` agree exactly (deepEqual) — the host owns no state. Every manifest field carries verbatim through the frozen mirror (runManifestId, workGraph, release, componentDigests, configHash, inputs, grantedApplicationCapabilities, steps, outputs, semanticFidelity, startedAt, finishedAt, retention). The semanticFidelity grade is `"measured"` (the deterministic lane carry-forward re-verified) — never re-badged.
- **W12-06 (refused/failed runs stay visible with typed states verbatim):** two REAL model-refusal runs — one `fail-closed` (the typed-failure state) and one `declared-fallback` (the fallback-used state). Both stay VISIBLE in the host's `listRuns()` — never hidden. The step status carries VERBATIM (`"typed-failure"` / `"fallback-used"`); the view-models project the typed state labels verbatim (`"Finished — typed failure"` / `"Finished — fallback used"`). A typed-failure step carries no provenance (the law, not a missing field). Multiple REAL runs surface in ledger insertion order; readRun agrees for each.
- **W12-07 (the ledger honesty label surfaces — never re-badged):** the host exposes `gradeNote: "BACKING: REAL (ledger: fixture-grade in-memory)"` (the exact string from the ADR). The host's `backing` is `"real"` (it projects over the REAL service); the `gradeNote` is the deeper honesty: the LEDGER is fixture-grade in-memory (the W9A label carried). Never inflated to `production` or `real-local-live`. Asserted by name in test #1 and test #7.
- **W12-08 (REAL committed revisions through the REAL library host):** a REAL `ArtifactGraphService` with REAL committed revisions — each revision's bytes are put through the `InMemoryArtifactBlobStore` (which hashes them and returns the contentHash), and the revision record's `contentHash` is the store's return value. Three revisions committed in chain order (root → user-edit → measurement); the host projects the lineage ROOT-FIRST (the Library law); the chain is preserved (parent → child); the view-model marks the head (the last in the chain). The `lineageNote` is a pure projection over the real provenance chain (`"real provenance for art:w12a-project — agent-run:run:w12a-1 → user-edit:edit:w12a-user-1 → measurement:lab:w12a-replay-1 (immutable lineage preserved; root first, head marked by the view)"`). Editability classes carry verbatim (editable / derived-only / opaque — never re-badged). The unknown-artifact typed refusal throws the verbatim reason.
- **W12-09 (the export seam — both arms named, both REAL):**
  - **Gate-allowed arm:** a revision committed with REAL bytes that hash (sha-256) to the declared contentHash; the seam returns `{ bytes, contentHash }`. The TEST re-hashes the bytes (`createHash("sha256").update(ok.bytes).digest("hex")`) and asserts `recomputed === ok.contentHash` — the hash-verification is the test's law, NOT the seam's. The seam returns the revision record's contentHash (the trusted hash), never re-computed from the bytes.
  - **Gate-refused arm:** a revision committed with a policy that PROHIBITS `export`; the seam with `usage: { usages: ["export"] }` returns a `ScreenRefusal` whose `reason` carries the gate's verbatim `ArtifactRightsRefusalError` message (`"policy rights refuse this revision read (fail-closed: bare, empty, non-permitted or prohibited usage context)"`). The blob store is NEVER touched (asserted by name in test #19: the refusal reason contains the rights message and does NOT contain `"no blob stored at"` or `"integrity check failed"` — the gate runs FIRST).
  - **Fail-closed arm:** a bare usage context (no `usage` field) refuses with the rights message — the wave-4 fail-closed law.
  - **Honest-absence arm:** an unknown revision id returns a `ScreenRefusal` with `"unknown revision <id> — the registry has no such revision"` — never a fabricated record.
  - **Capability-unavailable arm:** a gated service with no blob store wired refuses with the `ArtifactReadUnavailableError` message (`"no blob store is wired into this gated read seam; revision content cannot be read"`) — the gate's verbatim reason carries.

## FIXTURE EVIDENCE

- The W11C fixture hosts (`runsFixtureHost.ts`, `libraryFixtureHost.ts`) STAY — they are NOT deleted. The browser demo mount keeps them with `backing: "fixture"` + honest fixture labels. The REAL hosts are composition-grade siblings over the REAL services, tested in the node battery. The two coexist (asserted by name in test #8 and test #13: the fixture host still satisfies the frozen port, and the REAL host has no records until the service assembles them).
- The in-memory stores (`ArtifactGraphService`, `InMemoryArtifactBlobStore`, `DeterministicComponentStore`, `FixtureTransformModelAdapter`) are fixture-grade — they carry the W9A/W11 honesty label. The SERVICES are REAL (the deterministic lane spawns a real child process; the carry-forward re-verification is in-process; the gated read service runs the real fail-closed rights gate; the blob store verifies integrity on every read).
- The artifact CONTENT seed (the `"hello sporta"` / `"version 1 — initial agent cut"` / etc. text bytes) is fixture content — labeled as such. The hash computation (sha-256) is REAL (the `node:crypto` adapter).

## CONTRACT CHANGES

NONE. The frozen screen-port types (`RunsScreenPort`, `LibraryScreenPort`, `RunRecordShape`, `LibraryArtifactShape`, `LibraryRevisionShape`, `LibraryArtifactDetail`, `ScreenRefusal`) are UNTOUCHED. The frozen service contracts (`TransformRunService.listRuns/readRun`, `ArtifactGraphService.listArtifacts/readArtifact/lineage`, `ArtifactGatedReadService.readRevision/readRevisionContent`) are UNTOUCHED. The `architecture-policy.yaml` and `.architecture-baseline.json` are UNTOUCHED. The `package.json` and lockfile are UNTOUCHED.

The new additive types (`RunsRealHost extends RunsScreenPort`, `LibraryRealHost extends LibraryScreenPort`, `ExportRevisionContentOk`, `CreateRunsRealHostDeps`, `CreateLibraryRealHostDeps`, `CreateLibraryExportSeamDeps`) are NEW exports from the new files. They extend the frozen ports (structural satisfaction) — never edit them. The screen that consumes only `RunsScreenPort` / `LibraryScreenPort` keeps compiling; the TL composition root reads the additive `gradeNote` field for the badge.

The `RUNS_LEDGER_GRADE_NOTE` and `LIBRARY_REGISTRY_GRADE_NOTE` constants are NEW exports — the exact string from the ADR (`"BACKING: REAL (ledger: fixture-grade in-memory)"` / `"BACKING: REAL (registry: fixture-grade in-memory)"`).

## SECURITY

- **The gate law is preserved verbatim.** The export seam calls `gated.readRevision` and `gated.readRevisionContent` — both go through the wave-4 rights gate. The gate runs BEFORE every storage touch (asserted by name in test #19: a prohibited read does NOT reach the blob store). The seam NEVER bypasses the gate, NEVER re-hashes-and-claims, NEVER silently swallows a typed error.
- **Typed refusals preserved verbatim.** Every typed gate error (`ArtifactRightsRefusalError`, `ArtifactRetentionExpiredError`, `ArtifactReadUnavailableError`, `ArtifactBlobNotFoundError`, `ArtifactIntegrityError`) is caught and translated into a `ScreenRefusal` with the gate's own `Error.message` — never a silent no-op, never a stringly null, never a substituted wording.
- **The state-owner law.** The hosts own NO store, NO ledger, NO second state. The service IS the single authority; the adapters are pure projections. The blob store is the single content authority; the seam reads through the gated path, never directly.
- **The hash-verification law.** The seam returns the revision record's `contentHash` (the trusted hash), never a re-computation of the bytes. The store verifies bytes ↔ contentHash on every read (the store's integrity law). The TEST re-hashes to assert — the SEAM does not.
- **No new network/IO.** The hosts and the seam call only the injected services. No `fetch`, no `setTimeout`, no ambient state, no `Date.now()` (the clock is injected at the service layer).

## PERFORMANCE

- The hosts are pure projections — O(N) for `listRuns` / `listArtifacts` (one map over the service's array, one shallow clone per record). No quadratic behavior; no caching (the host owns no state).
- `readRun` / `readArtifact` are O(1) for the service call + O(L) for the projection (L = revision chain length). The lineage is read once via `graph.lineage(id)` (the existing chain read).
- The export seam makes exactly 2 gated service calls per invocation (`readRevision` + `readRevisionContent`) — no retry, no polling. The store's `read(contentHash)` is O(1) (Map lookup + integrity re-hash).
- All tests run in < 1 second (the deterministic-filter child process is the only IO; the test asserts `step.timingMs > 0` and observes ~30-50ms for the real child process). The full lane battery (19 tests) runs in ~520ms.
- No new memory pressure: the hosts hold no state; the test setup creates fresh services per test (the W11C pattern).

## RISKS

- **Run-manifest id collision under FIXED_NOW:** the `TransformRunService` derives `runManifestId` from `{pipelineId, version, releaseDigest, configHash, inputs, startedAt}`. When `startedAt` is fixed (the test pattern) and two runs share the same `releaseDigest` and `configHash`, the ledger's Map dedupes them (the second overwrites the first — the W9A idempotency law). The lane tests give each run a distinct `releaseDigest` to avoid the collision. The TL integration (which will use the system clock) is unaffected — `startedAt` varies per run in production. Recorded as a test-design note, not a service risk.
- **The `liveSessions` forward-compatibility probe:** the base `TransformRunManifest` does NOT declare `liveSessions`; the live-ingress `LiveTransformRunManifest` does. The `runsRealHost.ts` projects them via a structural cast + runtime `Array.isArray` check (the frozen port law — no cross-lane import of the live-ingress module). The probe is forward-compatible: if a future manifest type adds the field, the projection surfaces it verbatim. Risk: a manifest with a non-array `liveSessions` field would be silently treated as "no live sessions" (the `readLiveSessions` returns null). Mitigation: the W9A/W10A services never produce such a manifest; the probe is defensive.
- **The `gradeNote` is a host-level additive field, not a frozen-port field.** The screen that consumes only `RunsScreenPort` / `LibraryScreenPort` does not see it. The TL composition root must read it via the wider `RunsRealHost` / `LibraryRealHost` type and pass it down through additional wiring. Risk: if the TL forgets to wire it, the screen's badge will be missing. Mitigation: the constants `RUNS_LEDGER_GRADE_NOTE` and `LIBRARY_REGISTRY_GRADE_NOTE` are exported; the TL integration test (W12-16) will assert the badge is wired.
- **The export seam's `blobs` dep was elided in the work order** (signature: `deps: { gated: ArtifactGatedReadService; blobs: … }`). The seam's actual deps are `{ gated, usage? }` — the gated service ALREADY has the blobs injected at construction; the seam does NOT need a separate `blobs` dep (it would bypass the gate to read directly, which the ADR forbids). Recorded in DEVIATIONS.
- **No browser-real data path is claimed.** The browser demo mount keeps the fixture hosts with honest `backing: "fixture"` labels. The REAL hosts are composition-grade — they are tested in the node battery and wireable by the TL's `productComposition.ts`. The browser-real data path (local HTTP boundary) is typed-future with the P11 hosted-preview arc, never silently claimed here.

## BLOCKERS

NONE.

## DEVIATIONS

1. **The export seam's `blobs` dep was elided in the work order.** The work order's signature is `exportRevisionContent(deps: { gated: ArtifactGatedReadService; blobs: … })`. The seam's actual deps are `{ gated, usage? }`. Reasoning: the gated service already has the blobs injected at construction (`ArtifactGatedReadDeps.blobs?`); the seam calls `gated.readRevisionContent` which goes through the gate and then through the store (the store's read-time integrity check). Adding a separate `blobs` dep to the seam would either (a) duplicate what the gated service already has (no benefit) or (b) allow the seam to bypass the gate (forbidden by the ADR). The seam's law is "NEVER bypass the gate" — so the `blobs` dep is unnecessary. Documented here for TL review.

2. **The `gradeNote` is additive on the host type, not on the frozen port.** The work order says "the host exposes a `gradeNote`" — interpreted as an additive field on the REAL host type (`RunsRealHost extends RunsScreenPort { gradeNote: string }`), not a field on the frozen `RunsScreenPort`. Reasoning: the frozen port law says "the frozen screen-port types untouched; new names appended". Adding `gradeNote` to `RunsScreenPort` would be a frozen-contract edit; adding it to the REAL host type is additive. The TL composition root reads it via the wider type. Same pattern for the library host (parity).

3. **The TL baseline stated "83 pass + 2 honest quota-429 fails" at 571fd1b; this agent measured "85 pass / 0 fail" at the same SHA.** The 2 W10B quota tests (`sandboxModelAdapter.test.ts` W10B-3 + `composedSlice.test.ts` W10C-1) succeeded in this sandbox because the rate-limit window was not hit on this run. The total test count is unchanged (85 in baseline; 85 + 19 lane = 104 after my changes). The 2 W10B tests MAY fail with 429 quota refusals on a future run (the documented honest state per the work order) — recorded, not "fixed". This is a measurement variance, not a code deviation.

4. **The lane tests use distinct `releaseDigest` per run** (e.g. `sha256:${"a".repeat(63)}1` / `2` / `3`) to avoid `runManifestId` collisions under `FIXED_NOW`. The W11C precedent tests ran one run per service instance (no collision); the W12A lane runs three runs (succeeded/typed-failure/fallback-used) in the same service instance, so distinct releaseDigests are required. The TL integration (with the system clock) is unaffected — `startedAt` varies per run in production. Test-design note, not a service deviation.

## NEXT DEPENDENCIES

The five W11C NEXT-DEPENDENCIES seams, this lane closes 2 of 5 (the runs read seam W12-05/06/07 + the library read seam W12-08 + the export seam W12-09 — the library's two seams count as one screen). The remaining 3 are the other workers' lanes:

- **W12B (marketplace submission-states REAL host):** `createMyPipelinesRealHost` over REAL `TransformCandidateRecord`s (the `SubmissionService` lane); `creatorState` is a pure projection of the REAL lifecycle (DRAFT→SUBMITTED→…); `origin: "record"` for every row; the `origin: "fixture-demo"` rows retire to typed-refusal-backed REAL states; creator version-status reads through the REAL review seam (`readCreatorVersionStatus`).
- **W12C (connected-apps REAL host — audit + revoke write):** `createAppsRealHost` over `listAttachmentsByScope` + descriptor reads + audit reads over REAL `ApplicationActionRecord`s; the revoke write over `ApplicationEnvironmentService.revokeAttachment` (idempotent, safe-stop semantics verbatim); the existing "real-host adapter disables revoke with a reason" note retires.
- **TL integration (the wave's final arc):** `productComposition.ts` (TL-owned) wires the REAL services → REAL screen ports; `app.tsx` accepts optional real ports (constructor injection); the pure browser demo keeps the fixture hosts with honest labels; the missing-seam notes retire; the browser journeys re-run at both viewports; the six-gate battery re-measured at the station on every merge. The `gradeNote` fields on the REAL hosts feed the screen's evidence badge at this arc.

The browser-real data path (local HTTP boundary, the W10-A precedent) and the hosted deployment remain typed-future with the P11 hosted-preview arc (operator-credential-gated) — surfaced, never silently claimed.

---

## DELIVERY

**Branch:** `wave12/worker-a`
**Head SHA:** `21d9b47` (code) on top of `3a55586` (SPEC-first) on top of `571fd1b` (BASE SHA — W12 Wave 0 freeze).
**Pushed:** `https://github.com/payswapdotorg/Sporta-2.0.git` `wave12/worker-a`.

---

## Gate table (real measured numbers, this agent, this sandbox, 2026-10-15)

| Gate | Baseline @ 571fd1b (TL) | Baseline @ 571fd1b (this agent) | After w12a (this agent) | Status |
|---|---|---|---|---|
| architecture-check | 0 violations | 0 violations | 0 violations | GREEN |
| sporta-surface-check | OK additive-only | OK additive-only | OK additive-only | GREEN |
| scoped tsc -b packages/web | exit 0 | exit 0 | exit 0 | GREEN |
| Full sporta-* battery (`packages/sporta-*/test/**/*.test.ts`) | 882 pass / 0 fail | 882 pass / 0 fail | 882 pass / 0 fail | GREEN (unchanged) |
| Web test suite (`packages/web/test/*.test.ts`) | 83 pass + 2 quota-429 fails (documented) | 85 pass / 0 fail (the 2 W10B quota tests succeeded this run) | **104 pass / 0 fail** (85 + 19 lane) | GREEN (additive) |
| Lane tests (`packages/web/test/sportaSeams*.test.ts`) | n/a | n/a | **19 pass / 0 fail** | GREEN (NEW) |
| Lint | 0 errors / 70 warnings | 0 errors / 70 warnings | 0 errors / 70 warnings | GREEN (unchanged) |

**Acceptance gate closure:**

| Gate | Status | Evidence test name |
|---|---|---|
| W12-05 (REAL run through the REAL host) | CLOSED | `W12A-1 runs REAL host: a REAL deterministic run projects through the host (W12-05)` + `readRun refuses typed for an unknown run (W12-05 refusal law)` + `multiple REAL runs project through the host in ledger order` |
| W12-06 (honest-states law) | CLOSED | `a REAL typed model refusal projects the typed-failure state verbatim (W12-06)` + `a REAL declared-fallback model refusal projects fallback-used verbatim (W12-06)` |
| W12-07 (the ledger honesty label surfaces — never re-badged) | CLOSED | `backing real + the ledger honesty grade note surfaces (W12-07)` + `the ledger honesty label is the documented exact string (W12-07)` |
| W12-08 (REAL committed revisions through the REAL library host) | CLOSED | `REAL committed revisions project through the host root-first (W12-08)` + `multiple REAL artifacts surface in registry order; editability classes honest (W12-08)` + `readArtifact refuses typed for an unknown artifact (W12-08 refusal law)` |
| W12-09 (the export seam — both arms named, both REAL) | CLOSED | `the gate-allowed arm returns bytes that re-hash to the committed contentHash (W12-09)` + `the gate-refused arm returns a typed ScreenRefusal with the verbatim reason (W12-09)` + `a bare usage context fails closed into a typed ScreenRefusal (W12-09 fail-closed law)` + `an unknown revision id returns a typed ScreenRefusal (honest absence)` + `no blob store wired → typed ScreenRefusal (the gate's capability-unavailable law)` + `the gate NEVER bypasses — a prohibited read does NOT touch the blob store` |

The TL re-runs every gate at the integration station.
