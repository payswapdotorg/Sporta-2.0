# W12 Worker A — Runs + Library REAL Hosts SPEC (lane-level)

**Worker:** w12a · **Base SHA:** 571fd1b (W12 Wave 0 freeze) · **Branch:** wave12/worker-a
**Authority order:** docs/work-orders/w12-composition-seams-work-orders.md → docs/architecture/adr-w12-composition-seams.md → docs/testing/w12-acceptance.md → packages/web/src/sporta/runs/runsScreenPorts.ts + library/libraryScreenPorts.ts (FROZEN screen-port shapes) → packages/web/src/sporta/runs/runsFixtureHost.ts + library/libraryFixtureHost.ts (labeled fixture hosts) → packages/web/src/sporta/runs/runsScreenViews.ts + library/libraryScreenViews.ts (pure views) → packages/sporta-transforms/src/contract.ts (TransformRunService; W12-01 listRuns) → packages/sporta-artifacts/src/contract.ts (ArtifactGraphService W12-02 listArtifacts + ArtifactGatedReadService readRevisionContent) → packages/web/test/sportaScreens.test.ts (W11C precedent) → docs/work-orders/sporta-work-orders.md (universal worker law).

## 1. Scope

W12 Worker A owns the runs + library composition seams, made REAL. Three
deliverables close the lane:

| Task | File (owned, new) | Gate | Service exercised |
|---|---|---|---|
| W12A-1 — the runs REAL host | `packages/web/src/sporta/runs/runsRealHost.ts` | W12-05, W12-06, W12-07 | `TransformRunService.listRuns()` / `readRun()` (W12-01 freeze) |
| W12A-2 — the library REAL host | `packages/web/src/sporta/library/libraryRealHost.ts` | W12-08 | `ArtifactGraphService.listArtifacts()` / `readArtifact()` / `lineage()` (W12-02 freeze) |
| W12A-3 — the export/content read seam | `packages/web/src/sporta/library/libraryExportSeam.ts` | W12-09 | `ArtifactGatedReadService.readRevision()` + `readRevisionContent()` (wave-4 gated read) |

Plus new test files: `packages/web/test/sportaSeamsRuns*.test.ts`,
`packages/web/test/sportaSeamsLibrary*.test.ts`, and the export-seam tests
under `packages/web/test/sportaSeamsLibrary*.test.ts`. Plus the worker
report `docs/implementation/worker-w12a.md`.

ZERO edits to any other package/file (especially NOT product/app.tsx,
marketplace/, apps/, studio/, the sporta-* service packages, package.json,
or the lockfile). Additive-only: the frozen screen-port types untouched;
new names appended. File-size law: < 400 lines per src file.

## 2. Base-SHA facts (honest, verified)

- The W11C fixture hosts (`runsFixtureHost.ts`, `libraryFixtureHost.ts`)
  stay — they carry labeled FIXTURE demo records for the browser mount and
  their existing tests. The W12A REAL hosts are NEW composition-grade
  siblings over the REAL services, not replacements.
- The frozen screen-port shapes (`RunsScreenPort`, `LibraryScreenPort`,
  `RunRecordShape`, `LibraryArtifactShape`, `LibraryRevisionShape`,
  `LibraryArtifactDetail`, `ScreenRefusal`) are STRUCTURAL MIRRORS of the
  REAL service records — they are satisfied verbatim by projecting REAL
  `TransformRunManifest` / `ArtifactRecord` / `ArtifactRevisionRecord`
  records through them. No field is fabricated; no field is dropped.
- The REAL services expose:
  - `TransformRunService.listRuns(): readonly TransformRunManifest[]`
    (W12-01 freeze: ledger insertion order; the private Map IS the run
    ledger, fixture-grade in-memory per the W9A honesty label).
  - `TransformRunService.readRun(id): TransformRunManifest | null`
    (existing point read; null = unknown id; typed refusals throw).
  - `ArtifactGraphService.listArtifacts(): readonly ArtifactRecord[]`
    (W12-02 freeze: registry insertion order; the private Map IS the
    registry, fixture-grade in-memory).
  - `ArtifactGraphService.readArtifact(id): ArtifactRecord | null`
    (additive W11 accessor; null = unknown id).
  - `ArtifactGraphService.lineage(id): Promise<readonly ArtifactRevisionRecord[]>`
    (existing chain read; empty array = unknown id or no revisions).
  - `ArtifactGatedReadService.readRevision({ revisionId, usage }): Promise<ArtifactRevisionRecord | null>`
    (wave-4 gated read; null = unknown id; gate throws
    `ArtifactRightsRefusalError` / `ArtifactRetentionExpiredError` /
    `ArtifactReadUnavailableError` on refusal).
  - `ArtifactGatedReadService.readRevisionContent({ revisionId, usage }): Promise<Uint8Array | null>`
    (wave-4 gated content read; the gate runs BEFORE the storage touch;
    the store verifies bytes ↔ contentHash on every read).
- The architecture policy module `web` is `managed: false`; the
  architecture-check script skips it (managedOnly: true). The 400-line
  file-size law is therefore a worker rule, not enforced by the script —
  honored by reading.

## 3. State-owner law (verbatim from the ADR)

- The adapter owns **no store, no ledger, no second state**. It is a pure
  projection: service records in, screen-port shapes out (the structural
  mirrors already frozen in `runsScreenPorts.ts` / `libraryScreenPorts.ts`).
- Every write rides an EXISTING service write path. Worker A's lane has
  NO write — the export seam is a pure read over the gated seam; the
  revoke write belongs to Worker C.
- Typed refusals are preserved verbatim (UI-06: never a silent no-op,
  never a stringly null). An honest `ScreenRefusal` reason is a
  first-class result.
- Backing labels: `backing: "real"` only when composed over REAL services
  (the node battery composition; the browser demo mount keeps the labeled
  fixture hosts with honest `backing: "fixture"`).

## 4. The runs REAL host (W12A-1)

`createRunsRealHost(deps: { service: TransformRunService; workspace?: string }): RunsRealHost`

- `RunsRealHost extends RunsScreenPort` with one additive field
  `gradeNote: string` — the honest ledger-grade label
  `"BACKING: REAL (ledger: fixture-grade in-memory)"`. Surfaces to the
  screen as the evidence badge (W12-07 law; never re-badged as more real
  than it is).
- `listRuns()` calls `service.listRuns()` and projects every
  `TransformRunManifest` verbatim through the frozen `RunRecordShape`
  mirror: `runManifestId`, `workGraph`, `release`, `componentDigests`,
  `configHash`, `inputs`, `grantedApplicationCapabilities`, `steps`,
  `outputs`, `semanticFidelity` (grade + note), `startedAt`,
  `finishedAt`, `retention`. The optional `liveSessions` field is
  omitted (base manifests carry none; the live-ingress service attaches
  them and a future live-host adapter would surface them — additive).
- `readRun(id)` calls `service.readRun(id)`; `null` → throws a typed
  `Error` with the verbatim message `"real host: no run <id> (typed
  refusal — the ledger has no such manifest)"` (the fixture-host law:
  throw, never fabricate a record). The screen's catch path surfaces
  this as the typed refusal — never a silent no-op, never a stringly null.
- Typed service errors propagate verbatim — never swallowed, never stringly.
- The host owns NO store. The service IS the single ledger authority;
  the adapter is a structural projection over its records.

### W12A-1 acceptance (W12-05, W12-06, W12-07)

- **W12-05** — REAL deterministic run (the W11C `makeRuns` precedent — a
  REAL child-process trim step over real pipes, real carry-forward
  re-verification) projects through the REAL host: list + point reads
  agree; manifest fields verbatim; typed errors propagate.
- **W12-06** — honest-states law: a refused/typed-failure run stays
  visible with its typed state verbatim (the screen's `runStateClass`
  projects `"typed-failure"` from the step status; never softened).
- **W12-07** — the ledger honesty label `BACKING: REAL (ledger:
  fixture-grade in-memory)` is exposed via `host.gradeNote` and asserted
  by name — never re-badged as a bare `"real"`.

## 5. The library REAL host (W12A-2)

`createLibraryRealHost(deps: { graph: ArtifactGraphService }): LibraryRealHost`

- `LibraryRealHost extends LibraryScreenPort` with one additive field
  `gradeNote: string` — `"BACKING: REAL (registry: fixture-grade
  in-memory)"` (parity with the runs host; the artifact registry IS
  fixture-grade in-memory).
- `listArtifacts()` calls `graph.listArtifacts()` and projects every
  `ArtifactRecord` verbatim through the frozen `LibraryArtifactShape`
  mirror: `artifactId`, `kind`, `editability` (the honest editable /
  derived-only / opaque classes verbatim — never re-badged).
- `readArtifact(id)`:
  1. `graph.readArtifact(id)` — `null` → throws a typed `Error` with
     `"real host: no artifact <id> (typed refusal — the registry has no
     such artifact)"` (the fixture-host law).
  2. `graph.lineage(id)` — returns the immutable revision chain
     ROOT-FIRST (the Library law: history is preserved, never an
     overwritable file list). Project every `ArtifactRevisionRecord`
     verbatim through `LibraryRevisionShape`: `revisionId`,
     `artifactId`, `parentRevisionId?`, `contentHash`,
     `organizationVersion?`, `toolVersions`, `provenance`.
  3. The head revision (last in the chain) is marked per the view law
     (`revisionRows` already does this — the host supplies the chain
     root-first; the view marks the head).
  4. `lineageNote` is a pure projection over the real provenance chain:
     `"real provenance — <sourceKind>:<sourceRef> → … (immutable
     lineage preserved)"` (the unique source-kind/source-ref pairs in
     chain order; null only if the chain is empty).

### W12A-2 acceptance (W12-08)

- **W12-08** — REAL committed revisions (2-3 revisions with real
  content hashes) project through the REAL host: lineage root-first;
  head marked; editability classes honest; the unknown-artifact typed
  refusal throws verbatim (never a fabricated lineage).

## 6. The export/content read seam (W12A-3)

`exportRevisionContent(deps: { gated: ArtifactGatedReadService; usage?: ArtifactReadUsageContext }): (revisionId: string) => Promise<ExportRevisionContentOk | ScreenRefusal>`

- The seam is a CURRIED read function: takes deps, returns the read
  closure. The closure is a pure projection over the gated service —
  no store, no second state.
- The read flow (verbatim from the ADR's gate law):
  1. Call `gated.readRevision({ revisionId, usage })` to obtain the
     revision record. The gate runs FIRST (rights then retention). If
     the gate refuses, the typed `ArtifactRightsRefusalError` /
     `ArtifactRetentionExpiredError` /
     `ArtifactReadUnavailableError` is caught and translated into a
     `ScreenRefusal` with the gate's verbatim message — never bypassed,
     never stringly null. If the revision is unknown, the seam returns
     `ScreenRefusal` with `"unknown revision <id> — the registry has no
     such revision"`.
  2. Call `gated.readRevisionContent({ revisionId, usage })` to obtain
     the bytes. The gate runs FIRST (the gate precedes every storage
     touch — a prohibited or retention-expired content read NEVER
     reaches the blob store). The store verifies bytes ↔ contentHash on
     read (the store's integrity law). If the gate refuses, the typed
     error is caught and translated to `ScreenRefusal` with the
     verbatim reason.
  3. Return `{ bytes, contentHash: revision.contentHash }` — the
     contentHash is taken from the REVISION RECORD (the store has
     verified bytes ↔ contentHash). The seam NEVER re-hashes-and-claims
     (never computes its own hash of the bytes and asserts it as the
     content hash). The hash-verification is the store's read-time law.

### W12A-3 acceptance (W12-09)

- **W12-09** — both arms named, both REAL:
  - **Gate-allowed arm**: a revision committed with REAL bytes (sha-256
    content hash) and a policy permitting the declared usage; the seam
    returns bytes that re-hash to the returned contentHash (the test
    asserts `sha256Content(bytes) === contentHash` — the test does the
    re-hash, NOT the seam).
  - **Gate-refused arm**: a revision committed with a policy that
    prohibits the declared usage (or a bare usage context — fail-closed);
    the seam returns `ScreenRefusal` with the gate's verbatim reason
    (asserted by name; never a silent null).

## 7. Verification battery (the project law)

```bash
node scripts/architecture/architecture-check.mjs check       # 0 violations
node scripts/architecture/sporta-surface-check.mjs           # OK additive-only
pnpm exec tsc -b packages/web                                # scoped tsc exit 0
pnpm exec tsx --test "packages/web/test/sportaSeams*.test.ts"  # NEW lane tests
pnpm exec tsx --test "packages/sporta-*/test/**/*.test.ts"   # full battery (additive)
pnpm exec tsx --test "packages/web/test/*.test.ts"            # web suite (additive)
pnpm run lint                                                # 0 errors / 70 warnings (baseline)
```

The new lane tests MUST be additive on top of the baseline (state the
measured totals). The 2 W10B quota-429 tests MAY fail with honest quota
refusals — documented, never "fixed".

## 8. Acceptance checklist (lane gates)

- [x] SPEC committed before code (this file).
- [ ] Battery green at baseline AND on the lane tree (both numbers reported).
- [ ] arch-check / surface-check / tsc -b web / lint: no new violations.
- [ ] Evidence grades verbatim; fixture labeled; refusals typed and surfaced.
- [ ] Report `docs/implementation/worker-w12a.md` with the standard sections.
