# ADR — W12: the composition-side seams (run-history, artifact/lineage/export, app audit+revoke write, marketplace submission states)

Date: 2026-10-15 · Status: accepted for implementation · Wave: W12
Baseline: main `8668962` (P0–P10 + W11 complete; battery 873/873 + web 83/85 honest-quota · lint 0/70 · arch 0/0/0 · surface OK additive-only).

## Context

W11 delivered the Sporta-native product shell with all seven screens live on
`/sporta`. The W11C worker serialized five composition-side read/write seams as
NEXT DEPENDENCIES: they are battery-proven REAL at the port/view level (REAL
service records project through the screen views in the node battery), but the
browser mount satisfies the screen ports with honestly-labeled fixture hosts
and the screens surface typed missing-seam notes. The five seams:

1. **Run-history read** (screen `runs`) — `RunsScreenPort.listRuns()/readRun()`
   over the REAL `TransformRunService` ledger.
2. **Artifact/lineage read** (screen `library`) — `LibraryScreenPort.listArtifacts()/readArtifact()`
   over the REAL `ArtifactGraphService` immutable lineage.
3. **Artifact-content/export read** (screen `library`) — revision content bytes
   through the REAL gated read (`ArtifactGatedReadService.readRevisionContent`),
   hash-verified, honest refusals.
4. **App audit + revoke write** (screen `connected-apps`) — audit reads over
   REAL `ApplicationActionRecord`s + the revoke write over the REAL
   `ApplicationEnvironmentService.revokeAttachment` (idempotent, safe-stops sessions).
5. **Marketplace submission states** (screen `my-pipelines`) — creator-side
   DRAFT/SUBMITTED/… read model over REAL `TransformCandidateRecord`s (the
   `SubmissionService` lane), retiring the `origin: "fixture-demo"` rows to
   typed-refusal-backed REAL states.

The blocking gap is enumeration: the REAL services expose point reads
(`readRun`, `readArtifact`, `byPipelineAndVersion`) but no listing reads the
screen ports require. This is closed by TL-serialized additive reads (Wave 0),
never by a shadow ledger in the UI.

## Decision

### 1. Grade law (the W10/W11 precedent, stated once)

- A composition seam is **REAL** when the screen port is satisfied by an
  adapter that calls the REAL service over its frozen contract and returns
  REAL records verbatim (typed errors propagate, no re-badging, no silent
  fallback). Evidence label: `REAL` with the named service + test.
- The **browser demo mount** stays the labeled fixture composition when no
  server data path exists (the W11 law: never re-badge). What changes is the
  seam's existence at the composition grade: the missing-seam notes retire
  because the REAL host exists, is tested, and is wireable.
- A **browser-real data path** (local HTTP boundary, the W10-A precedent) is
  typed-future with the hosted-preview arc (P11) — not silently claimed here.

### 2. Adapter laws (the state-owner law, verbatim from W11)

- The adapter owns **no store, no ledger, no second state**. It is a pure
  projection: service records in, screen-port shapes out (the structural
  mirrors already frozen in `*ScreenPorts.ts`).
- Every write rides an EXISTING service write path. The connected-apps revoke
  write rides `revokeAttachment` — exactly one write path, no parallel grant
  path from the screen (attaching stays with the consent flow).
- Typed refusals are preserved verbatim (UI-06: never a silent no-op, never a
  stringly null). An honest `ScreenRefusal` reason is a first-class result.
- Backing labels: `backing: "real"` only when composed over REAL services
  (node battery / headless composition); `backing: "fixture"` in the pure
  browser demo — the badge law from W11C is unchanged.

### 3. TL-serialized Wave 0: the enumeration reads (additive-only)

The frozen services gain additive read capabilities, each with a named test at
the freeze commit:

- `TransformRunService.listRuns(): readonly TransformRunManifest[]` — ledger
  insertion order; the private Map is the run ledger (fixture-grade store,
  honest label carried from W9A), NOT a new authority.
- `ArtifactGraphService.listArtifacts(): readonly ArtifactRecord[]` — registry
  order; point reads unchanged.
- Marketplace creator reads: a NEW `CreatorCandidateQueryService` in
  `sporta-marketplace/src/app/` over the candidate store (the W4-B
  new-service pattern; the frozen `CandidateStorePort` is untouched). The
  in-memory store implementation gains `listAll()` (implementation-level
  addition; the frozen port is unchanged). Exported additively from
  `contract.ts` so the web adapter can consume it.
- `sporta-app-environments` needs no service change: `listAttachmentsByScope`,
  `readAudit(sessionId)`, `revokeAttachment` already exist and are frozen.

Module `provides` registrations (additive): `transform-run-ledger-reads`,
`artifact-registry-reads`, `marketplace-creator-reads`.

### 4. Worker lanes (disjoint web roots; the W11 territory law)

- **w12a** — runs + library REAL hosts: `packages/web/src/sporta/runs/**`,
  `packages/web/src/sporta/library/**`, new test file(s) in
  `packages/web/test/` (disjoint names), report doc.
- **w12b** — marketplace submission-states REAL host:
  `packages/web/src/sporta/marketplace/**`, new test file(s), report doc.
- **w12c** — connected-apps REAL host (audit reads + revoke write):
  `packages/web/src/sporta/apps/**`, new test file(s), report doc.
- No worker touches `packages/web/src/sporta/product/**` (the TL integration
  root), the TL-serialized service files, `main.tsx`, package manifests, or
  the lockfile.

### 5. TL integration (the wave's final arc)

`productComposition.ts` (TL-owned, the boot/composition precedent): a
headless Node composition that wires the REAL services (in-memory or FS-backed
per the existing boot law) and returns the REAL screen ports; `app.tsx`
accepts optional real ports (constructor injection — the existing props law);
the pure browser demo keeps the fixture hosts with honest labels; the
missing-seam notes retire; the browser journeys re-run at both viewports; the
six-gate battery re-measured at the station on every merge.

## Consequences

- The five W11C NEXT-DEPENDENCIES seams close with REAL evidence at the
  composition grade; the product screens become wireable to REAL state.
- Surface growth stays additive-only; no frozen contract changes.
- The browser-real data path and hosted deployment remain typed-future (P11,
  operator-credential-gated) — surfaced, never silently claimed.
- Risk: the run ledger is fixture-grade in-memory (W9A honesty label) — the
  adapter must carry that label through to the screen's evidence surface
  (`BACKING: REAL (ledger: fixture-grade in-memory)`) — honest, not hidden.
