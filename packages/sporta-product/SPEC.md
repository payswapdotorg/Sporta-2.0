# sporta-product SPEC (Wave 1, work-order WO-C1)

Scope: the intent-first product shell projection (C4) and the
learning-consent intake (C3). This module is created by Worker C and is
NOT yet registered in architecture-policy.yaml — the TL registers it at
integration (a pure policy append; the module follows all conventions so
registration is trivial).

## Behavior

### ProductLoopProjection (`trace`)

- Read-model projection over INJECTED ports only (constructor:
  WorkGraphPort, OrganizationResolverPort, ArtifactGraphPort,
  EditorBrokerPort, ArenaClientPort + optional ambient context
  `{ environmentProfile?, userRef?, constraints? }`; `environmentProfile`
  defaults to `"unknown"`, `constraints` to `[]`).
- Unknown `workGraphId` → typed `UnknownWorkGraphError` (no fabricated
  trace; documented design decision).
- The trace always contains ALL 12 stages in canonical order:
  intent, organization, execution, progress, artifact, takeover, editor,
  learning, capability-gap, arena, result, organization-improvement.
- Stage derivation rules (v1, honest — no fabrication):
  - intent: graph found → `done`, ref = workGraphId.
  - organization: `resolver.resolve({ intent, workGraph, ambient })` →
    `done`, ref = `<organizationId>@v<version>`, detail = the selected
    candidate rationale (explainable selection surfaced to the UX).
  - execution: outcome nodes exist → `done`; else by graph status
    (executing/awaiting-user/escalated → `active`; open → `pending`;
    closed → `done`).
  - progress: action nodes → `done`; run nodes only → `active`; else
    `pending` (detail carries task/run/action counts).
  - artifact: latest artifact-kind node (by seq) →
    `ArtifactGraphPort.lineage(nodeId)`; revisions > 0 → `done`
    (ref = artifact node id); 0 revisions → `active`; no artifact nodes
    → `pending`. Integration assumption (documented): the nodeId of an
    artifact-kind work-graph node IS the `ArtifactRecord.artifactId`.
  - takeover / editor: `pending` — v1 ports expose no editor-session or
    takeover history read seam (Wave 2 event-projection seam).
  - learning: `pending` — the consent intake is interactive; learning
    state becomes traceable when arena-result/learning read seams land.
  - capability-gap: graph status `escalated` → `done` (a gap was
    recorded and escalated); else `pending`.
  - arena: graph status `escalated` → `active`; else `pending`.
  - result: `pending` — reading the Arena result requires escalation
    refs which v1 work-graph nodes do not carry.
  - organization-improvement: `pending` — candidate/promotion read
    seams are Worker A Wave 2.
- The projection calls ONLY read methods (`readWorkGraph`, `resolve`,
  `lineage`). It never calls `appendNode`, `openIntent`, editor broker
  methods, or arena client methods (v1 has no arena read-by-work-graph
  seam) — asserted by tests.
- No domain logic: pure read-model derivation only.

### LearningIntake (`recordConsent`)

- Constructor: `{ workGraphs: WorkGraphPort }`.
- Reads the work graph's `intent.learningPolicy` (the LearningPolicyRef).
- Refusals (typed errors; NO artifact is created — the throw happens
  before any store write):
  - `decision: "denied"` → `LearningConsentRefusedError` (explicit user
    denial always blocks learning, regardless of `requireConsent`);
  - empty `scopes` → `LearningScopeError`;
  - scopes not contained in the policy's `scopes` → `LearningScopeError`
    (consent cannot grant more than the policy permits; empty policy
    scopes = no learning permitted).
  - unknown `workGraphId` → `UnknownWorkGraphError`.
- Granted consent → a `LearningArtifactRecord` candidate:
  `status: "candidate"`, `scope: "user"`, `class` = the sorted-first
  (primary) scope, `evidence: []`, `permission` = the granted
  (deduped, sorted) scopes with `requireConsent: true` (downstream reuse
  of user-scope learning requires consent).
- Idempotent per `(workGraphId, userId, scopes)`: deterministic
  `learningArtifactId` (`learn:<userId>:<workGraphId>:<sorted+scopes>`);
  retries return the SAME record. Denied retries keep throwing.
- Consent revocation (granted → later denied) is Wave 2; in v1 a denial
  always throws and never deletes stored candidates.

## Single state owner

- Learning candidates created by the intake: this module's app service
  (in-memory, fixture-grade). Promotion to tenant/global scope belongs
  to sporta-organizations/sporta-lab (Worker A).
- The work graph: sporta-work (read-only here).

## Invariants

- Learning always carries explicit scope and permission (invariant 12).
- A user preference never silently becomes a global rule (invariant 13):
  intake artifacts are `scope: "user"`, `status: "candidate"` only.
- The projection is a read model: it must not implement domain logic or
  mutate any owning module's state.
- Public surface is `src/contract.ts` only; ≤12 public methods
  (v1: `trace`, `recordConsent`).

## Failure semantics

Typed errors extend `ProductShellError` (exported from the public
contract): `UnknownWorkGraphError`, `LearningConsentRefusedError`,
`LearningScopeError`. Errors from injected ports propagate unchanged.

## Event order

`trace`: readWorkGraph → (unknown → throw) → resolve → derive execution/
progress → lineage(latest artifact node) → assemble the fixed 12-stage
trace → return.

`recordConsent`: empty-scopes check → readWorkGraph → policy-scope check
→ decision check (denied → throw, no artifact) → derive candidate →
idempotency lookup → store → return.

## Wave-4 host conversion (W4C-3, append-only)

ADR: docs/architecture/adr-wave4-c6-host.md (Decision 5 — the
host-conversion lane; the UI honesty law). The host is `packages/web`
(@zcode/web, React 19 + Vite). This section is the spec for the host
surface that renders and drives THIS module's projection; it appends to
the wave-1 spec above, changing nothing in it.

### Host surface law

The host renders the live ProductLoopTrace projection and owns EXACTLY
TWO write paths — nothing else may mutate through the host:

1. READ surface: `SportaHostPort.readTrace()` → the current
   `ProductLoopTrace` for the active work graph (stages in canonical
   order, each with state pending/active/done/blocked/refused, ref and
   detail). Read-only: the host never fabricates stage state; a seam
   that is absent renders as its honest pending detail (the wave-3
   graceful-degradation law, unchanged).
2. WRITE path A — learning-consent intake: `submitConsent(input)` →
   `LearningIntakePort.recordConsent` (this module's C3 intake).
   `granted` produces a `scope: "user"`, `status: "candidate"`
   LearningArtifactRecord; `denied` creates NO artifact and surfaces the
   typed `LearningConsentRefusedError` (the host shows the refusal — it
   never swallows it and never renders a fabricated artifact).
3. WRITE path B — takeover entry: `submitTakeover(edit)` → the A17
   takeover leg: a real MLT XML round-trip edit on the latest artifact
   revision, reconciled through the real editor broker, then a user
   append through the work-graph admission seam (`WorkGraphPort
   .appendNode` with `actorKind: "user"`). The user append is
   first-class lineage (A17 law: the work graph is only ever APPENDED).

Any other mutation API the host exposes is a spec violation.

### Composition law

The composition root (packages/web/src/sporta/composition.ts) wires the
loop per the a17-full-real composition, honestly labeled per leg:

- REAL: the process leg (a real spawned child process speaking the
  stream-json headless interface; the vendored zcode-cli remains
  unbuildable in this sandbox — the executable is a labeled stand-in
  while the process, pipes, wall time and exit code are real), the
  storage leg (real FsArtifactBlobStore on a real directory, real
  content-addressed bytes), the editor leg (real KdenliveAdapter MLT
  parse → mutate → serialize → re-parse), the arena leg (real
  HttpArenaTransport over a real localhost HTTP server; the Arena role
  behind the server is fixture-scripted), the read seams (real
  ArenaClientService escalation seam, real LearningIntakeService
  learning seam, real OrganizationCandidateReadService organization
  seam).
- FIXTURE (labeled): the work-graph/organization/preference/session
  stores (in-memory), the scripted Arena role, the stand-in executable.
- The composition runs HEADLESS (Node) only; the browser route renders
  through the same port types with a labeled fixture host because the
  Node runtime legs (spawn/FS/HTTP server) cannot execute in a browser
  bundle.

### Dependency law (WO-C1 transitional bridge)

`@zcode/web` does not declare `@sporta/*` dependencies (workspace
manifests and pnpm-lock.yaml are TL-owned). The bridge is a
TRANSITIONAL GITIGNORED SYMLINK set: `packages/web/node_modules/@sporta
/<pkg> -> ../../../sporta-<pkg>` for every package the composition
imports, recorded in packages/web/.gitignore. The exact workspace
dependency registration to replace it is recorded in the worker report
under NEXT DEPENDENCIES. No manifest or lockfile change is made in this
lane.

### Evidence laws (host conversion)

- Headless tests (node:test + tsx, project law) drive the COMPOSITION
  MODULE: the full loop including consent accept AND decline (the typed
  refusal) and the takeover append; the trace is observable end-to-end.
- The React render surface is typed EXACTLY `build-verified/untested`:
  `pnpm --filter @zcode/web build` is attempted and its REAL result
  (exit code + wall time, or the honest failure) is recorded in the
  worker report. It is never claimed browser-tested; no browser test
  harness exists in this repo.
- Real evidence states how it was measured (command, wall time, counts);
  fixture evidence is labeled fixture. A stage rendered from a fixture
  host in the browser is labeled fixture in the UI itself.
