# Worker C Implementation Report

Status: WAVE 1 IMPLEMENTED (branch wave1/worker-c, implementation commits 140400f spec → c657b8d arena → 689a420 fmt → 746c8e0 product, plus this report as the branch HEAD commit; never pushed — push is TL-only)

Scope: C1 CapabilityGap + C2 Arena client boundary (packages/sporta-arena), C3 learning-consent intake + C4 intent-first product shell (packages/sporta-product, created via work-order WO-C1). C5 (deployment/provider integration) and C6 (full rights propagation across planes) are Wave 2 — see NEXT DEPENDENCIES.

## Ownership

Capability gaps, Arena integration, user takeover/learning controls, product UX, deployment/provider integration and rights/privacy propagation.

## WORK ITEMS

- C1 — CapabilityGap intake: `recordGap` on the Arena client service, idempotent per `gapId` (identical retry → same record; divergent retry → typed `GapConflictError`; omitted gapId → `gap:auto:<seq>`, non-idempotent by design). Gap lifecycle implemented as a pure transition function (open → escalated → resolved | closed, resolved → closed) with typed errors.
- C2 — Arena client boundary: `escalate` idempotent per `idempotencyKey` with a deterministic sha-256-derived escalationId; refuses empty permittedActions, unknown gaps, non-open gaps; submits exactly the caller's `contextRefs` to the transport (context minimization); `readResult` mirrors the transport lifecycle through the legal path only; `validateResult` produces structured verdicts only (never mutates — Arena never mutates Sporta state). Escalation lifecycle = the literal contract chain as a pure transition table + single-step + BFS-path functions. In-memory FAKE transport adapter simulating the full lifecycle and producing an unvalidated result with learningArtifactRefs.
- C3 — learning-consent intake (`LearningIntakeService`): denied consent → typed `LearningConsentRefusedError` thrown before any store write (no artifact is created — documented design choice); granted consent → candidate `LearningArtifactRecord` (scope "user", status "candidate"); scopes must be contained in the work graph's learning policy; idempotent per (workGraphId, userId, scopes) with deterministic ids.
- C4 — product shell (`ProductLoopProjection`): read-model projection over the five injected v1 ports (work/organizations/artifacts/editors/arena); the trace always contains all 12 canonical stages in order; underivable stages are honestly "pending" with seam-naming details; unknown workGraphId → typed error.
- Module infrastructure: `packages/sporta-product` created (package.json, tsconfig with references, module.ts manifest, contract.ts, contract.example.ts, CONTRACT.md, SPEC.md) per WO-C1 — registration in architecture-policy.yaml is left to the TL (policy file is TL-owned).
- Spec-before-code: SPEC.md written and committed (140400f) before any implementation commit.

## CHANGED FILES

All inside the owned boundary `packages/sporta-arena/` and `packages/sporta-product/` (plus this report). No TL-owned or other workers' files were touched.

- packages/sporta-arena/SPEC.md (new)
- packages/sporta-arena/CONTRACT.md (updated invariants)
- packages/sporta-arena/tsconfig.json (added `types: ["node"]` — mirrors the packages/services convention so the hoisted @types/node is visible for node:crypto; no new dependency)
- packages/sporta-arena/src/contract.ts (additive extension, 84 lines)
- packages/sporta-arena/src/contract.example.ts (example updated for the extended EscalateInput)
- packages/sporta-arena/src/domain/{errors,gap,escalation,resultValidation,fingerprint}.ts (new, pure)
- packages/sporta-arena/src/app/{arenaTransport,arenaClient}.ts (new)
- packages/sporta-arena/src/adapters/fakeTransport.ts (new)
- packages/sporta-arena/test/{fixtures,domain,gap,escalation,validation,fakeTransport,arenaLoop}.test.ts (new)
- packages/sporta-product/ (new module): SPEC.md, CONTRACT.md, package.json, tsconfig.json, src/module.ts, src/contract.ts, src/contract.example.ts, src/domain/{errors,learningConsent}.ts, src/app/{productLoopProjection,learningIntake}.ts, test/{productLoopProjection,learningIntake}.test.ts
- Local-only bootstrap (gitignored, not committed): packages/sporta-product/node_modules/@sporta/* symlinks per WO-C1.

## TESTS

Runner: `pnpm exec tsx --test` (node:test + node:assert/strict, zero new dependencies). 52 tests, all passing, deterministic, no network.

- packages/sporta-arena/test/domain.test.ts (8): gap + escalation lifecycle legal/illegal transitions, path function reachability, session-mode policy table, stable stringify.
- packages/sporta-arena/test/gap.test.ts (4): recordGap idempotency, divergent-retry conflict, auto ids, progressed-record retry.
- packages/sporta-arena/test/escalation.test.ts (10): escalate idempotency (same id + same record, no duplicate submission), divergent-retry conflict, deterministic escalationId across service instances, empty-permittedActions refusal, unknown-gap refusal, re-escalation refusal, record-equals-contract boundary (deepEqual against the exact canonical shape; asserts no contextRefs/budget leakage), budget presence, context minimization on the submission, client-writes-only-its-own-store.
- packages/sporta-arena/test/validation.test.ts (7): well-formed result accepted with all four checks; missing/malformed payload hash; wrong provenance sourceKind; sessionMode/resultType mismatch; unknown escalation; verdict-only (no mutation).
- packages/sporta-arena/test/fakeTransport.test.ts (5): full lifecycle walk created→closed; result produced at "submitted" (learningArtifactRefs, arena-session provenance, injectable clock, validated=false); rejected-outcome branch; idempotent submit; unknown-escalation status null.
- packages/sporta-arena/test/arenaLoop.test.ts (4): fixture loop gap → escalate → advance → readResult (lifecycle mirror + result) → validateResult accepted → idempotent retry returns the mirrored record; readResult null cases; unreachable-lifecycle-jump typed error.
- packages/sporta-product/test/productLoopProjection.test.ts (5): happy-path full 12-stage trace as an exact deepEqual snapshot; escalated scenario (capability-gap done, arena active); early graph (pending stages); artifact-node-without-revisions active; unknown workGraphId typed error; port-call assertions (openIntent/appendNode/editor/arena/write calls all zero).
- packages/sporta-product/test/learningIntake.test.ts (9): granted → candidate artifact (exact deepEqual); idempotent retries (same record); multi-scope class/permission; denied → typed refusal (twice) and no artifact created (later granted still creates exactly one); scope-not-in-policy; empty-policy; empty-scopes; unknown work graph; intake never writes through the work graph port.

## REAL EVIDENCE

Commands run from /home/z/sporta-2.0-c (worktree, branch wave1/worker-c, base c9a90ac):

1. `node scripts/architecture/architecture-check.mjs check` →
   `architecture: OK / violations: 0 / baseline: 0 / new: 0` (exit 0). The registered module sporta-arena is checked; sporta-product is outside the registered set as designed (WO-C1).
2. `pnpm exec tsc -b packages/sporta-policy packages/sporta-contracts packages/sporta-work packages/sporta-organizations packages/sporta-lab packages/sporta-evaluation packages/sporta-artifacts packages/sporta-editors packages/sporta-world packages/sporta-compute packages/sporta-arena packages/sporta-product` → clean, exit 0, no output.
3. `pnpm exec tsx --test packages/sporta-arena/test/*.test.ts packages/sporta-product/test/*.test.ts` → `tests 52 / pass 52 / fail 0 / cancelled 0` (per-file counts: arenaLoop 4, domain 8, escalation 10, fakeTransport 5, gap 4, validation 7, learningIntake 9, productLoopProjection 5).
4. `pnpm lint` → `Found 70 warnings and 0 errors` — identical to the Wave 0 baseline (70 pre-existing warnings; my files add zero; no sporta file appears in the lint output).
5. `pnpm exec oxfmt packages/sporta-arena packages/sporta-product` → applied (format-only commit 689a420); `pnpm exec oxfmt --check packages/sporta-arena packages/sporta-product` → "All matched files use the correct format."

All five gates were re-run after the final formatting change and are green. The full-repo `pnpm typecheck` remains OOM-killed on this 4 GB sandbox (environment limitation recorded by the TL at Wave 0; the scoped tsc protocol above is the agreed local verification).

## FIXTURE EVIDENCE

Explicitly fixture-grade (no real Arena, no network, no real expert sessions):

- `InMemoryArenaTransport` (src/adapters/fakeTransport.ts) is an in-memory FAKE Arena transport: it simulates the Arena side (lifecycle advancement, result production with a sha-256 fixture payload hash and `learn:arena:*` refs). It stands in for the real HTTP transport (Wave 2) and its results are fixture evidence by construction. Its produced `ArenaResultRecord.validated` is deliberately `false` — the Arena side never claims Sporta-side validation.
- Test-local hand-written fakes in packages/sporta-product/test (FakeWorkGraphPort, FakeOrganizationResolver, FakeArtifactGraph, FakeEditorBroker, FakeArenaClient) and packages/sporta-arena/test (SpyTransport, ScriptedTransport, fixture builders) are fixture-grade by construction.
- All idempotency/lifecycle/validation behavior above is REAL code execution against fixture inputs — the logic under test is production code, the data is fixture data.

## CONTRACT CHANGES

Additive only; no frozen v1 export was removed or renamed.

- packages/sporta-arena/src/contract.ts: `EscalateInput` gained required fields `tenantRef: string`, `learningPermissions: LearningPolicyRef`, `policy: PolicySet` and optional `budget` — the canonical `ArenaEscalationRecord` (TL-owned, frozen) requires exactly these, and docs/contracts/arena-escalation.md lists tenant refs, learning permissions and session/privacy policy as request content, so the v1 input was under-specified. NOTE FOR TL REVIEW: adding required fields to an input interface is a strengthening; the only pre-existing consumer (contract.example.ts) was updated in the same commit. New additive exports: typed error classes (ArenaError, GapConflictError, UnknownGapError, EscalationConflictError, EscalationPolicyError, IllegalGapTransitionError, IllegalEscalationTransitionError) and type aliases (GapStatus, EscalationLifecycle, EscalationOutcome, SessionMode, ArenaResultType). Public method count unchanged (ArenaClientPort: 4 methods ≤ 12); contract.ts is 84 lines ≤ 300.
- packages/sporta-product/src/contract.ts (NEW module surface): ProductLoopStageKind (12 stages), ProductLoopStage, ProductLoopTrace, ProductLoopProjectionPort (trace), LearningConsentInput, LearningIntakePort (recordConsent), typed errors (ProductShellError, UnknownWorkGraphError, LearningConsentRefusedError, LearningScopeError). 2 public methods ≤ 12; 76 lines ≤ 300.
- No changes to @sporta/contracts, @sporta/policy or any other worker's package.

## RIGHTS-PROVENANCE

- Escalations carry the caller-supplied `PolicySet` (rights/privacy/retention) verbatim on the record (invariant 22 propagation to the Arena boundary); the escalation example uses privacy visibility "escalation".
- Context minimization is enforced and tested: the escalation record itself carries NO contextRefs; the transport submission carries exactly the caller-given refs, nothing inferred (the gap's own context refs are NOT auto-included — asserted).
- Arena result provenance is validated structurally (`sourceKind === "arena-session"`), and no hidden chain-of-thought is ever stored (no such field exists in the contract).
- Learning artifacts carry explicit `permission` (granted scopes + requireConsent true for downstream reuse) and are scope "user"/status "candidate" — a user preference never silently becomes a global rule (invariants 12/13).
- Full rights propagation ACROSS planes (C6) is Wave 2 (NEXT DEPENDENCIES).

## PERFORMANCE

No performance claims are made (fixture-grade, in-memory). Observations: the full test suite (52 tests) completes in well under 2 seconds; lifecycle BFS operates on a 14-state table; idempotency lookups are O(1) map lookups; fingerprints are computed once per call. No timers, no polling, no network.

## SECURITY

- The service refuses empty permittedActions (Arena sessions are isolated capsules with explicitly permitted actions only — invariant 15).
- Tenant identity is part of the escalation id derivation and the record; tenant checks happen at this service boundary.
- No secrets, credentials, provider identifiers or internal addresses appear in any source, test or example. External provider identifiers never become domain identifiers.
- node:crypto is used only for deterministic id derivation and fixture payload hashes (node builtins, no new dependencies).
- The client writes only its own store; the transport is its only outside interaction (asserted in tests).

## RISKS

- EscalateInput was strengthened with required fields (see CONTRACT CHANGES) — flagged for TL review at merge; all pre-existing consumers were updated.
- The sessionMode → expected resultType table is an additive module policy (the escalation contract fixes the vocabulary, not the mapping); it is documented in CONTRACT.md and may need ratification when the real Arena lands.
- The product shell's artifact stage assumes "the nodeId of an artifact-kind work graph node IS the ArtifactRecord.artifactId" — an integration assumption needing Worker A/B confirmation.
- Arena-side multi-step lifecycle mirroring validates reachability, not step-by-step observation: a transport reporting a state reachable-but-skipped (e.g. created → closed) is accepted. The pure single-step function rejects illegal steps and is what the fake transport walks.
- The revision_required → in_progress rework loop is intentionally NOT implemented (the contract doc shows revision_required → closed only); if the real Arena supports rework, the transition table needs a Wave 2 update.

## BLOCKERS

None for Wave 1 scope. (Known environment limitation: full-repo pnpm typecheck is OOM-killed on this sandbox — TL-recorded; CI runs the full gate.)

## DEVIATIONS

- ArenaTransportPort is declared in the app layer (src/app/arenaTransport.ts), not the adapters layer as the work order's wording suggested: the architecture checker's layer-direction law forbids app → adapters imports, and the app service must consume the port. Adapters (fake now, HTTP later) import and implement it — the port stays module-internal (not in the public contract), honoring the work order's intent.
- packages/sporta-arena/tsconfig.json gained `"types": ["node"]` (mirroring the packages/services convention) so the hoisted @types/node resolves for node:crypto. This is a per-package tsconfig I own; no root or lockfile change.
- The product projection's constructor takes the five mandated ports PLUS an optional ambient-context object (environmentProfile/userRef/constraints, defaults "unknown"/[]); documented in SPEC.md/CONTRACT.md.
- The product package's adapters layer is empty in Wave 1 (fakes live in test files per the work order; the module has no transport of its own), so the layer directory is not created (git cannot track empty directories); module.ts documents this for the TL's registration.
- recordGap/escalate idempotency conflict fingerprints are key-order insensitive but array-order sensitive (a retry with reordered contextRefs is a conflict) — documented in CONTRACT.md.

## NEXT DEPENDENCIES (work-order notes to the TL)

1. REGISTER sporta-product in architecture-policy.yaml at integration (TL-owned, serialized). Suggested entry: id `sporta-product`, roots `[packages/sporta-product/src]`, managed: true, requires `[sporta-contracts, sporta-work, sporta-organizations, sporta-artifacts, sporta-editors, sporta-world, sporta-arena, sporta-evaluation, sporta-lab, sporta-policy]` (exactly the requires list in packages/sporta-product/src/module.ts), publicEntrypoints `[packages/sporta-product/src/contract.ts]`, layers domain/app/adapters, layerOrder domain/app/adapters, owner worker-c. Then run a real `pnpm install` so the package's declared workspace deps are linked (the WO-C1 node_modules symlinks were local-only and gitignored) and re-run all gates.
2. ARENA TRANSPORT WAVE (C2 continuation): implement the real Arena transport adapter (HTTP) behind the module-internal `ArenaTransportPort` in the adapters layer, including credential handling via the ZCode credential vault (PROJECT-STATE reuse map). The port shape is frozen in src/app/arenaTransport.ts; the fake transport documents the expected simulation semantics.
3. DEPLOYMENT/PROVIDER ABSTRACTION WAVE (C5): provider-neutral deployment surfaces per docs/architecture/deployment.md (control/artifact/execution planes, typed provider fallback). Nothing was seeded in Wave 1 — typed-refusal semantics already exist as the module error taxonomy pattern to follow.
4. RIGHTS PROPAGATION WAVE (C6): enforce PolicySet propagation across the artifact/editor/arena planes end-to-end (invariant 22). The escalation boundary already carries and stores the PolicySet verbatim.
5. READ SEAMS NEEDED BY THE PRODUCT SHELL (cross-worker, for the trace's pending stages): (a) escalation/gap refs reachable from a work graph (v1 WorkGraphNode carries no refs; either a refs field from Worker A or the event-projection seam from PROJECT-STATE); (b) an editor-session history read port from Worker B (takeover/editor stages); (c) a learning-artifact read port (learning stage); (d) organization candidate/promotion read access (organization-improvement stage, Worker A Wave 2).
6. ESCALATEINPUT STRENGTHENING ratification (see CONTRACT CHANGES / RISKS) and the sessionMode→resultType policy table ratification when the real Arena contract is negotiated.
7. ARENA-UX WAVE 2 (worker packet C: "Arena UX/lifecycle, user takeover UX"): the takeover admission flow (user appends during active runs through existing admission/lease boundaries — ZCode extension seam 4 in PROJECT-STATE).

## Current frontier

Wave 1 Worker C scope (C1–C4) implemented and green: 52 tests passing, all five verification gates green on branch wave1/worker-c. Awaiting TL integration (merge, sporta-product policy registration, real install, gate re-run).

---

# Wave 3 — Worker C lane (W3C): arena read seam + projection wiring + A17 full-real loop

Base: 14836c6 (wave-3 contracts carry). Branch: wave3/worker-c. Scope: W3C-1 (sporta-arena EscalationReadPort + entrypoint re-export of the real HTTP transport), W3C-2 (sporta-product LearningArtifactReadPort + ProductLoopProjection optional read-seam wiring), W3C-3 (a17-full-real test — the first full-loop green trace). Ownership law held: only packages/sporta-arena + packages/sporta-product + this report were touched; contracts frozen (consumed as-is); no dependencies added; pnpm-lock.yaml untouched.

## WORK ITEMS

- W3C-1 — escalation read seam (sporta-arena): `ArenaClientService` implements `EscalationReadPort` additively. `listEscalations(query)` filters by workGraphId/gapId/escalationId over the service's own escalation store (creation order); `listResults(query)` filters by escalationId/resultId/validatedOnly, reusing `readResult` (one transport status query per escalation, bounded by the limit) so result listing inherits the exact readResult boundary law — lifecycle mirroring through the legal path only. Summaries are field-for-field with ArenaEscalationRecord / ArenaResultRecord (escalationId/gapId/workGraphId/sessionMode/lifecycle; resultId/escalationId/resultType/validated). Bounded-query law: default limit 50, hard cap 200 (a caller can never request an unbounded scan). Pure helpers live in a new domain file (escalationReadSeam.ts).
- W3C-1 — entrypoint re-export (the W2 note): `@sporta/arena/contract` now re-exports the REAL `HttpArenaTransport`, its `HttpArenaTransportDeps` type and its `ArenaTransportError` taxonomy (previously deep-importable only), plus the frozen read-seam types (EscalationReadPort, EscalationSummary, EscalationResultSummary, EscalationQuery, EscalationResultQuery) from @sporta/contracts. Additive-only; surface check green.
- W3C-2 — learning read seam (sporta-product): `LearningIntakeService` implements `LearningArtifactReadPort` additively. `listLearningArtifacts(query)` filters by learningArtifactId/scope/status over the consent store (consent order), bounded (50 default / 200 hard cap), summaries field-for-field with LearningArtifactRecord. The intake store only ever reports candidates (promotion belongs to organizations/lab/evaluation — documented). The seam types are re-exported additively from `@sporta/product/contract`.
- W3C-2 — projection wiring: `ProductLoopProjectionDeps` grows four OPTIONAL read seams (editorSessionHistory?, learningArtifacts?, organizationCandidates?, escalations?) typed from `@sporta/contracts/contract`. Stage wiring (all derivations in app-layer files, read-only, bounded):
  - takeover/editor: sessions reachable from the graph's artifact lineages (the artifacts deps, latest 10 artifact nodes) or node refs (artifact-revision, editor-session), read through the seam. A lineage revision with editor-session provenance (a reconciled edit) ⇒ done; open session ⇒ active; closed sessions ⇒ done; none ⇒ pending.
  - learning: artifacts listed through the seam, scoped to the intent's learningPolicy scopes (class filter); candidate ⇒ active; promoted ⇒ done, where promoted ⇔ seam status "promoted" OR the artifact id appears in the selected (promoted) organization version's learnedPreferences (the canonical record of which learning was promoted into a composition — the resolver is already a projection dep, so this needs no new state).
  - capability-gap/arena: escalations collected per workGraphId query + node refs (capability-gap, escalation); any escalation ⇒ capability-gap done; arena maps the lifecycle: in-flight ⇒ active, accepted_result/closed ⇒ done, revision_required ⇒ blocked, rejected ⇒ refused.
  - result: results for the graph's escalations (escalation queries + arena-result node refs) through the seam; validated ⇒ done; unvalidated ⇒ active ("awaiting validation"); none ⇒ pending.
  - organization-improvement: candidates + promotions queried for the RESOLVED organization; a LIVE un-promoted candidate version ⇒ active (the current improvement leg outranks past promotions — same precedence philosophy as the arena stage's in-flight rule); promotion decision "promoted" ⇒ done; rejected ⇒ refused; rolled-back ⇒ blocked.
  - Degradation law (tested per-seam): an ABSENT seam keeps the stage's exact v1 `pending: …` string; with no seams the entire 12-stage trace is byte-identical to v1 — the wave-1/2 tests (productLoopProjection.test.ts full deepEqual snapshot, a17-seeded-loop) pass UNCHANGED.
  - Composition economy: `resolve` is called exactly once per trace and shared; artifact lineages are fetched once (latest 10 artifact nodes) and shared between the artifact and takeover/editor stages.
- W3C-3 — a17-full-real test (packages/sporta-product/test/a17-full-real.test.ts + support/fixtures files): the complete seeded loop on ONE lineage (wg:a17-full) with REAL legs honestly labeled per leg (see EVIDENCE below): REAL ZCodeAgentRuntimeAdapter with the stand-in executable; REAL FsArtifactBlobStore on a real temp dir (real files, real sha-256 addresses, read-back verified, measured); REAL KdenliveAdapter MLT XML round-trip (parse → pure user edit → serialize → re-parse identity asserted) through the REAL EditorBrokerService reconcile (the reconciled revision's content hash is the real blob content address of the serialized XML); REAL HttpArenaTransport over a REAL localhost HTTP server (real TCP sockets, 7 real requests incl. exactly one POST, real wire JSON, context minimization asserted on the wire); read seams wired live — escalations = the real ArenaClientService seam (W3C-1), learningArtifacts = the real LearningIntakeService seam (W3C-2), editorSessionHistory/organizationCandidates = test-local adapters typed from the frozen contracts shapes (worker-b/worker-a lanes pending) reflecting REAL broker sessions and REAL registry drafts/promotions. Asserts: a MID-LOOP trace showing the loop honestly in flight (execution/learning/arena/result/organization-improvement active), then the FINAL trace with EVERY one of the 12 stages done (the first full-loop green trace), plus the A17 law (append-only WorkGraph, r1 byte-identical, r1→r2 chain, monotonic seq).

## CHANGED FILES

All inside the owned boundary packages/sporta-arena + packages/sporta-product (+ this report). No TL-owned or other workers' files touched. No dependency changes; pnpm-lock.yaml untouched.

- packages/sporta-arena/src/domain/escalationReadSeam.ts (NEW, 53 lines — bounded limits + field-for-field summary mappers, pure)
- packages/sporta-arena/src/app/arenaClient.ts (MODIFIED — implements EscalationReadPort; +listEscalations/listResults; 274 lines)
- packages/sporta-arena/src/contract.ts (MODIFIED — additive re-exports: read-seam types + HttpArenaTransport/HttpArenaTransportDeps/ArenaTransportError; 72 lines)
- packages/sporta-arena/test/escalationReadSeam.test.ts (NEW, 8 tests)
- packages/sporta-arena/CONTRACT.md (APPENDED wave-3 invariants)
- packages/sporta-product/src/domain/learningReadSeam.ts (NEW, 35 lines)
- packages/sporta-product/src/app/learningIntake.ts (MODIFIED — implements LearningArtifactReadPort; 102 lines)
- packages/sporta-product/src/app/productLoopDeps.ts (NEW, 48 lines — ProductLoopProjectionDeps type root; breaks the projection↔seam-stages import cycle)
- packages/sporta-product/src/app/productLoopSeamStages.ts (NEW, 227 lines — takeover/editor/learning derivations + shared bounded-read helpers + the v1 SEAM_* pending strings)
- packages/sporta-product/src/app/productLoopEscalationStages.ts (NEW, 297 lines — capability-gap/arena/result/organization-improvement derivations)
- packages/sporta-product/src/app/productLoopProjection.ts (MODIFIED — optional seam deps, shared derivation context, delegates seam stages; re-exports the deps type from its previous path; 169 lines)
- packages/sporta-product/src/contract.ts (MODIFIED — additive learning read-seam type re-exports; 88 lines)
- packages/sporta-product/test/learningReadSeam.test.ts (NEW, 5 tests)
- packages/sporta-product/test/productLoopProjectionSeams.test.ts (NEW, 10 tests)
- packages/sporta-product/test/a17FullRealSupport.ts (NEW, 285 lines — StubArenaRole real HTTP server + test-local seam adapters, honestly labeled)
- packages/sporta-product/test/a17FullRealFixtures.ts (NEW, 244 lines — fixtures + composition factory + pure user edit + countFiles)
- packages/sporta-product/test/a17-full-real.test.ts (NEW, 440 lines — the full-real loop test)
- packages/sporta-product/CONTRACT.md (APPENDED wave-3 invariants)
- docs/implementation/worker-c.md (this wave-3 section, appended — wave-1 history untouched)

## TESTS

Runner: `pnpm exec tsx --test` (node:test + node:assert/strict, zero new dependencies, zero new frameworks). 24 new tests, all passing, deterministic; the full sporta battery is 223 pass / 0 fail / 0 skipped (wave-2 baseline 199 + 24 new). The wave-1/2 tests — including the a17-seeded-loop byte-identical trace test and the productLoopProjection full deepEqual snapshot — pass UNCHANGED (regression law held by construction; no existing test file was edited).

- packages/sporta-arena/test/escalationReadSeam.test.ts (8): frozen-shape structural satisfaction; field-for-field summaries in creation order; workGraphId/gapId/escalationId filters; default limit 50 / explicit limit / hard cap 200 (205 seeded escalations); result summaries field-for-field after the simulated session; escalationId/resultId/validatedOnly filters (validatedOnly empty against the fake transport's honest validated=false); empty-before-results and unknown-escalation; seam performs no writes (repeated reads converge, no transport submissions, idempotency keys unaffected).
- packages/sporta-product/test/learningReadSeam.test.ts (5): frozen-shape satisfaction; field-for-field summaries in consent order; learningArtifactId/scope/status filters; default 50 / hard cap 200 (205 consents); empty before consent, never writes through the work port, denied consent still lists nothing.
- packages/sporta-product/test/productLoopProjectionSeams.test.ts (10): takeover/editor done on a reconciled editor-session revision (with resolve-called-exactly-once economy assertion); open ⇒ active / closed ⇒ done / none ⇒ pending; node refs (editor-session, artifact-revision) drive session queries; learning candidate ⇒ active, promoted status OR promoted-org learnedPreferences ⇒ done, out-of-scope class ignored, rejected ⇒ refused; arena in-flight ⇒ active + capability-gap done, accepted_result + validated ⇒ done, rejected ⇒ refused, revision_required ⇒ blocked; seam-present-but-empty honors the v1 status signal with honest seam-aware details; escalation/arena-result node refs drive seam queries; organization-improvement live-candidate ⇒ active (past promotion does not mask a live candidate), promotion ⇒ done, queries scoped to the resolved organization; degradation law — each seam removed in turn while the others stay wired keeps exactly its v1 pending string.
- packages/sporta-product/test/a17-full-real.test.ts (1): the full-real loop (see REAL EVIDENCE).

## REAL EVIDENCE

Measured by running the verification battery and the full-real test on this sandbox (node v25.x, pnpm 10.33.2 via corepack); numbers are from the final pre-commit runs:

- architecture:check → `architecture: OK / violations: 0 / baseline: 0 / new: 0` (exit 0). Two violations were found and fixed DURING development (productLoopSeamStages.ts 470 lines > 400; a projection↔seam-stages import cycle) — resolved by the three-file split (deps / editor-learning stages / escalation stages).
- node scripts/architecture/sporta-surface-check.mjs → `sporta-surface-check: OK — frozen surfaces intact, growth is additive-only`; sporta-arena `+27 additive` names, sporta-product `+7 additive` names; all 12 modules export every frozen name.
- pnpm exec tsc -b packages/sporta-arena packages/sporta-product → clean, exit 0, no output.
- pnpm exec tsx --test (arena + product) → 98 pass / 0 fail; full sporta battery `packages/sporta-*/test/*.test.ts` → 223 pass / 0 fail / 0 skipped (baseline 199 + 24 new).
- pnpm lint → `Found 70 warnings and 0 errors` — identical to the wave-2 baseline (70 pre-existing warnings; my files add zero — three transient unused-import warnings were found and removed during development).
- pnpm exec oxfmt --check (my 15 new/modified files) → "All matched files use the correct format."
- A17 full-real test, real per-leg measurements (printed by the test, final run):
  - execution (REAL process via ZCodeAgentRuntimeAdapter + stand-in executable): wall 80ms, 5 stream-json events on real pipes, terminal "completed", real exit code 0, real ISO-8601 timestamps.
  - storage (REAL FsArtifactBlobStore on a real mkdtemp dir): 2 blob files on real disk, 65 + 1950 bytes, content-verified read-back (deepEqual both blobs), sha-256 content addresses, put wall ~2ms + ~1ms.
  - editor (REAL KdenliveAdapter): 1696 chars of real MLT XML parsed, user edit as a pure transformation, 1950 chars serialized, parse→serialize→parse round-trip identity asserted, 36 typed edit operations derived by the real adapter, wall ~2ms; REAL EditorBrokerService session + reconcile committed r2 whose contentHash IS the blob content address of the serialized XML.
  - arena (REAL HttpArenaTransport over a real localhost HTTP server on an ephemeral port): 7 real requests — 1 real POST /escalations (context minimization asserted on the wire: exactly the caller's refs, nothing else) and 6 real GETs (idempotency pre-check, result reads, seam listResults) over real TCP sockets, wall ~28ms; the Arena role behind the server is fixture-scripted (labeled).
  - read seams wired live: escalations = ArenaClientService (W3C-1) over the real HTTP transport; learningArtifacts = LearningIntakeService (W3C-2); editorSessionHistory/organizationCandidates = test-local adapters over REAL broker/registry events (labeled).
  - FINAL trace: all 12 stages done (per-stage assertion with detail in the failure message); organization ref org:a17-full@v2; artifact "2 revision(s)"; arena "escalation concluded (accepted_result)"; result "1 validated result(s)"; learning ref learn:user:operator:wg:a17-full:…; MID-loop trace: intent/organization/progress/artifact/takeover/editor/capability-gap done, execution/learning/arena/result/organization-improvement active.

## FIXTURE EVIDENCE

- The executable behind the REAL execution leg is test/fixtures/zcode-cli-standin.mjs — a REAL OS process speaking the same headless interface, but a stand-in: the vendored apps/zcode-cli cannot build in this sandbox (carried BLOCKER from W2; real zcode-cli execution unmeasured).
- The Arena ROLE behind the real HTTP server (StubArenaRole, test/a17FullRealSupport.ts) is fixture-scripted: the "expert session" is a scripted lifecycle walk (created → … → submitted → result produced; validating → accepted_result flips the result's ARENA-side `validated` flag — the lifecycle's own meaning, explicitly NOT Sporta-side validation; Sporta's verdict is computed and asserted separately via validateResult). No real expert, no real Arena deployment.
- editorSessionHistory + organizationCandidates seams in the full-real test are test-local adapters typed from the frozen contracts shapes (worker-b's/worker-a's wave-3 module implementations are not at this base) — they reflect REAL EditorBrokerService sessions and REAL OrganizationRegistryService drafts/promotions, but the adapters themselves are test doubles, labeled as such.
- Work-graph/organization/preference stores are in-memory fixtures (InMemoryWorkGraphStore etc. — v1 has no FS stores for those domains). The scripted user edit and the initial MLT document are fixture data; the parse/serialize/round-trip machinery exercising them is REAL.
- All arena/product seam unit tests use in-memory stores and hand-written in-test fakes (SpyTransport-style, per the wave-1 convention) — fixture-grade by construction; the logic under test is production code.

## CONTRACT CHANGES

Additive only; no frozen v1 export was removed or renamed; the contracts package was NOT touched (frozen to this lane — consumed exactly as serialized at 14836c6).

- packages/sporta-arena/src/contract.ts: +EscalationReadPort, +EscalationSummary, +EscalationResultSummary, +EscalationQuery, +EscalationResultQuery (type re-exports from @sporta/contracts), +HttpArenaTransport (value), +HttpArenaTransportDeps (type), +ArenaTransportError (value). 72 lines ≤ 300; ArenaClientPort unchanged at 4 methods (the read seam is a separate frozen interface the service implements additively).
- packages/sporta-product/src/contract.ts: +LearningArtifactReadPort, +LearningArtifactSummary, +LearningArtifactQuery (type re-exports from @sporta/contracts). 88 lines ≤ 300; LearningIntakePort unchanged (1 method); ProductLoopProjectionPort unchanged (trace only).
- No changes to @sporta/contracts, @sporta/policy or any other worker's package.

## RIGHTS-PROVENANCE

- The escalation read seam is read-only and returns only escalation/result summaries — no contextRefs, no policy bodies, no learning permissions cross the seam surface (context minimization preserved: the escalation record itself never carried contextRefs; the wire POST carries exactly the caller's refs, asserted in the full-real test).
- C6/invariant 22 note (ADR consequence 5): rights enforcement at the READ boundary is carried by the seam IMPLEMENTATIONS. ArenaClientService.listEscalations/listResults perform no PolicySet filtering (the client-side store has no caller context) — the rights-gated reads are the editor-history and organization-candidate seams owned by worker-b/worker-a; the ADR's "rights propagation at read boundaries" for the arena side rides the real Arena's authorization (HttpArenaTransport carries the optional Authorization header, already tested in W2). Typed as a note for the TL at integration.
- Learning artifacts surface only (learningArtifactId, class, scope, status) — no evidence refs, no permission bodies; the learning stage's promoted detection reads the selected organization's learnedPreferences (ids only).
- The full-real test's fake tenant/user ids are fragment-assembled literals ("tenant:operator", "user:operator" — no credentials); no secrets, tokens, or provider identifiers appear in any new file. The GitHub token exists only in the git remote URL and is never echoed in code, tests, or this report.

## PERFORMANCE

- Projection: with all four seams wired, one trace performs exactly 1 resolve + ≤10 artifact lineages + bounded seam queries (limit 50 each; ≤16 node refs per kind; ≤50 revision session lookups). The no-seam path performs the same reads as v1 except the artifact-stage lineage is now prefetched for up to 10 artifact nodes (was: latest only) — bounded, read-only, no behavioral change to v1 outputs.
- ArenaClientService.listEscalations: O(n) over the escalation store with early break at the limit; listResults: one transport round-trip per escalation (bounded by the limit) — the projection's arena/result stages cost ~2 transport GETs per escalation in the HTTP wiring (measured: 6 GETs for one escalation across the full-real loop's two traces + explicit reads).
- Full-real test wall time: the whole loop (real spawn + real FS + real HTTP) completes in ~150ms (test duration), of which execution ~80ms (process wall), arena ~28ms (7 real HTTP round-trips on localhost), storage ~3ms, editor ~2ms. No timers, no polling loops other than the 25ms execution poll.
- No new dependencies; pure in-memory maps for the seam stores; sha-256 only via node:crypto (already used).

## SECURITY

- The read seams expose summaries only — no policy bodies, no context refs, no budgets, no permitted-action lists cross the seam surface; unbounded reads are impossible (default 50 / hard cap 200 on every seam query; the projection additionally bounds node-ref breadth at 16 and revision lookups at 50).
- listResults inherits readResult's lifecycle mirroring through the legal path (illegal jumps throw typed errors — never silently accepted).
- HttpArenaTransport re-export changes no transport behavior (validate-before-apply at the boundary unchanged); the transport's authorization header support remains optional and is not exercised with any credential in my tests.
- No secrets or credentials in any source/test I added; the only token in play is the git push URL (never echoed).

## RISKS

- The learning stage's "promoted" derivation uses the selected (promoted) organization version's learnedPreferences in ADDITION to the seam's status field (the intake implementation can only ever report candidates — promotion state lives in the organizations module). If the TL prefers a pure-seam-status derivation, the learnedPreferences check can be dropped; the full-real loop's learning-done would then require a seam implementation that reports promoted status (none exists at this base). Documented in CONTRACT.md; flagged for integration review.
- The organization-improvement precedence (LIVE un-promoted candidate outranks past promotions) is a projection policy choice to keep the mid-loop trace honest (the v1 baseline promotion would otherwise mark the stage done from the start). The baseline-promotion semantics should be ratified at integration.
- listEscalations reports the client's LAST-KNOWN lifecycle (mirrored only on result reads) — a projection consuming only listEscalations sees the lifecycle as of the last readResult/listResults call. Documented in CONTRACT.md.
- v1 evidence cannot distinguish user takeover from agent-driven editor use (both derive from the reconciled editor-session revision); the takeover/editor stages share evidence by design — separating them needs ledger/actor access typed as future.
- ArenaTransportError/ArenaTransportPort name similarity: the entrypoint now exports both the port types and the real transport; consumers wire HttpArenaTransport into ArenaClientServiceDeps.transport — no ambiguity in practice, noted for reviewers.
- The stub Arena's validated=true flip at accepted_result models the ARENA-side validation gate. If the real Arena never sets validated=true, the result stage will read active after Sporta-side validation (honest, since v1 records no Sporta-side verdict in any readable state). Typed as a semantic to ratify with the real Arena contract.

## BLOCKERS

None for the W3C scope. Carried environment notes (TL-recorded, unchanged): full-repo `pnpm typecheck` remains OOM-killed on this 4GB sandbox — the scoped `tsc -b` protocol is the agreed local verification; the real zcode-cli bundle cannot be built here (missing vendored internal packages) — the stand-in executable stays, honestly labeled.

## DEVIATIONS

- a17-full-real.test.ts is 440 lines (> the 400-line src law). The architecture check scopes maxFileLines to src/ roots (tests are not scanned), and the repo's integrated baseline already carries a larger test file (httpArenaTransport.test.ts, 508 lines at base, TL-gate-verified at W2 integration). I split the fixtures/composition/support into two separate files (244 + 285 lines) and kept the single-flow loop test intact rather than fragmenting the ONE-lineage narrative further. Flagged for the TL to accept or order split.
- Pre-existing files outside my edits remain oxfmt-unformatted at base (a17-real-execution.test.ts, httpArenaTransport.test.ts, httpArenaTransport.ts, deployment.ts, deploymentDescriptor.ts + gitignored dist/ outputs). I formatted ONLY my new/modified files (15 files, all clean); reformatting pre-existing files is outside this lane's scope.
- The projection's artifact-stage lineage read is now prefetched for up to 10 artifact nodes (shared with the takeover/editor derivations) where v1 read only the latest node's lineage — a bounded read-model expansion, documented; the v1 OUTPUTS are unchanged (regression tests prove byte-identity).
- The mid-loop trace in a17-full-real uses an explicit workService.transitionStatus("awaiting-user" → "escalated") transition to model the escalation edge (the legal successor-table path); the append-driven status machine has no append trigger that reaches "escalated" in v1 — the explicit lifecycle port exists for exactly such edges (documented in sporta-work SPEC).
- Escalation/node-ref paths in the projection are exercised by unit tests with hand-written refs (the sporta-work appendNode API does not accept refs at this base — worker A's wave-3 lane owns appending refs at status transitions); the full-real test reaches done on every stage through the port-query paths (workGraphId / revision lineages), not through node refs.

## NEXT DEPENDENCIES (work-order notes to the TL)

1. INTEGRATION: re-run the full battery at the integration station (reported numbers are never trusted, only measured ones count) — expected: arch 0/0/0, surface OK, tsc clean, tests 223 pass (199 baseline + 24 new), lint 0 errors / 70 warnings.
2. WORKER-B LANE (editorSessionHistory): land the sporta-editors implementation behind the frozen EditorSessionHistoryReadPort — the projection wiring and the degradation law are ready; a real closeSession API (v1 sessions never close) would let the closed-session ⇒ done derivation fire without an editor-produced revision.
3. WORKER-A LANE (organizationCandidates + refs): land the sporta-lab/evaluation OrganizationCandidateReadPort implementation and the WorkGraphNode.refs appends (escalation/gap/result edges at the status transitions sporta-work already owns). The projection already consumes refs of all six kinds; once appends carry refs, the node-ref paths activate in real loops (currently exercised by unit tests only).
4. RATIFY the two projection policy choices (RISKS): learning "promoted" via learnedPreferences, and the live-candidate precedence for organization-improvement.
5. WAVE-4: the packages/web product UX host conversion consuming the un-pended projection + read seams (PROJECT-STATE frontier item 2) — the projection deps are now seam-complete for that host.
6. The arena side of C6 rights propagation at the read boundary (ADR consequence 5): decide whether ArenaClientService seams gain a caller-context gate (PolicySet/tenant check) or whether the transport-level authorization is deemed sufficient for v1.

DELIVERY: branch wave3/worker-c @ 6f4c0d2 (work commit; delivery sha recorded in a doc rider commit on top)

Gate table (real, measured on this sandbox, final pre-commit run):

| Gate | Command | Result |
|---|---|---|
| Architecture | pnpm architecture:check | OK — violations 0, baseline 0, new 0 |
| Surface | node scripts/architecture/sporta-surface-check.mjs | OK — frozen surfaces intact, additive-only |
| Typecheck | pnpm exec tsc -b packages/sporta-arena packages/sporta-product | clean, exit 0 |
| Tests (arena+product) | pnpm exec tsx --test packages/sporta-arena/test/*.test.ts packages/sporta-product/test/*.test.ts | 98 pass / 0 fail |
| Tests (full sporta battery) | pnpm exec tsx --test packages/sporta-*/test/*.test.ts | 223 pass / 0 fail / 0 skipped |
| Lint | pnpm lint | 70 warnings, 0 errors (baseline identical) |
| Format (my files) | pnpm exec oxfmt --check <15 new/modified files> | all correct |
| A17 full-real | pnpm exec tsx --test packages/sporta-product/test/a17-full-real.test.ts | pass — every stage done, real evidence per leg |

# Wave 5 — Worker C (w5c)

Status: WAVE 5 IMPLEMENTED (branch wave5/worker-c; commits dd01381 spec → e84dafb implementation → 4ae4b7c fmt → this report as the branch HEAD commit).

Scope: the playback engine over renderer render-model timelines (ADR wave-5, decisions 3 + 5): deterministic seek/step/play over bounded buffers, typed playback errors, per-tick reality frames (tactical board delta; play-by-play narrative segments) with read-only provenance/rights carry-forward. The packages/web host wiring is TL integration work (deliberately absent). The render-model surface of `sporta-render` is w5b's parallel lane; my code compiles against MY OWN port declarations (additive duplication law) and lives strictly under `src/domain/playback/` + `test/playback*.test.ts` + the package scaffolding.

## WORK ITEMS

- W5C-1 playback controller: `PlaybackController` over the merged, validated timeline index — `seek(t)` (range-validated, tick-destination clamped), `step(delta)` (tick-quantized, validated), `play(rate)`/`pause()`, `advance(dtMs)` (rate-scaled, sub-tick playhead accumulation so slow-motion works, end-of-timeline is a normal stop), `frameAt(t)` (pure, idempotent per t), `recentFrames()` (frozen copy of the bounded buffer), `state` (frozen snapshot). Deterministic state machine: no wall-clock, no RNG — time is always a declarative argument.
- W5C-1 typed playback errors: 14 classes over `PlaybackError` (machine-readable `detail`, validation precedes mutation): empty timeline, malformed event, malformed carry-forward, unknown/duplicate reality kind, carry mismatch, invalid options, out-of-range seek, out-of-range step, invalid rate, invalid step delta, paused advance, invalid advance dt.
- W5C-1 bounded buffers (three laws, SPEC-documented): (1) retained frame history is capacity-bounded (default 64, FIFO eviction); (2) `advance` returns caller-owned transients while the controller retains only the bounded tail; (3) the merged event index is built once and is input-sized — the controller's entire retained state is one playhead time, one rate, the bounded buffer and the index. No frame memoization (would be an unbounded cache).
- W5C-2 per-tick reality frames: `frameAtTick` pure projection — the tick's ACTIVE events (half-open interval intersection law; canonical order atMs → kind declaration order → eventId) project per declared reality kind: tactical → board delta (sorted-unique declared event ids + affected entities; zero geometry invention), play-by-play → narrative segments (event anchors with declared sequence + payload refs; zero phrasing invention). Every frame carries the carry-forward header (source + provenance + rights scope) verbatim and is deeply frozen.
- W5C-2 zero SWM consumption: the package declares ZERO dependencies; the port types are declared locally; a source-scan test machine-checks that no `@sporta/*` import and no `SportsWorldModelRecord` token appear anywhere under `src/` (the adapter invariant holds at playback).
- W5C-3 headless composition root + honest examples: `contract.example.ts` (fixture-grade timelines + `examplePlaybackSession`, which runs for real) and the node:test suite below, covering the domain-extension law (a second synthetic domain end-to-end), the bounded-buffer laws, determinism (double-run deep-equal) and all error paths.
- Module infrastructure: `packages/sporta-render` created per the WO-C1 law — SPEC.md + CONTRACT.md committed FIRST (dd01381, spec-before-code), then package.json (`@sporta/render`, zero dependencies, zero devDependencies — TypeScript/tsx/oxlint resolve from the workspace root, keeping pnpm-lock.yaml untouched), tsconfig with references, module.ts manifest, contract.ts (single public entrypoint), contract.example.ts.

## CHANGED FILES

All inside the owned boundary `packages/sporta-render/` (plus this report). No TL-owned files, no root manifests, no pnpm-lock.yaml, no other workers' files.

- packages/sporta-render/SPEC.md (new; committed first — playback SPEC: time model, controller semantics, buffer laws, failure table, honest evidence)
- packages/sporta-render/CONTRACT.md (new; committed first — playback invariants + the parallel-lane note + TL integration steps)
- packages/sporta-render/package.json (new; `@sporta/render`, type module, exports ./contract, zero deps)
- packages/sporta-render/tsconfig.json (new; extends tsconfig.base.json, composite, references [])
- packages/sporta-render/src/module.ts (new; manifest: id sporta-render, requires [], provides ["playback-engine"], publicEntrypoints ["contract.ts"])
- packages/sporta-render/src/contract.ts (new; the public playback surface re-exports)
- packages/sporta-render/src/contract.example.ts (new; fixture-grade timelines + the honest composition example)
- packages/sporta-render/src/domain/playback/ports.ts (new; RenderTimelinePort + event/options types + carry-forward summaries + defaults)
- packages/sporta-render/src/domain/playback/errors.ts (new; 14 typed errors)
- packages/sporta-render/src/domain/playback/carry.ts (new; carry-forward validation/copy/structural equality — the file-size-law split of the original 416-line timeline.ts)
- packages/sporta-render/src/domain/playback/timeline.ts (new; options resolution, event validation, merged index build, binary-searched active-window query)
- packages/sporta-render/src/domain/playback/frames.ts (new; per-tick reality frame projections + deep freeze)
- packages/sporta-render/src/domain/playback/controller.ts (new; PlaybackController)
- packages/sporta-render/test/playback.{timeline,controller,frames,buffer,composition}.test.ts (new; 54 tests)
- docs/implementation/worker-c.md (this section)

## TESTS

Runner: `pnpm exec tsx --test` (node:test + node:assert/strict, zero new dependencies — the repo law). 54 new tests, all passing, deterministic, no network, no host.

- playback.timeline.test.ts (14): empty timelines; malformed events (10 variants incl. duplicate ids within one timeline); unknown kind; duplicate kind; carry mismatch; malformed carry (5 variants incl. confidence bounds); invalid options (7 variants) + defaults; duration/totalTicks/destination-tick clamping; half-open interval law; canonical merged order + declared sequence preservation; default duration; structural equality semantics.
- playback.controller.test.ts (14): construction state + opening frame; seek semantics; out-of-range seek leaves no trace; seek-at-end; frameAt purity/idempotence; step forward/backward/zero; step refusals (range + non-integer); play/pause rate validation + persistence; paused/invalid advance refusals; advance emission law (one frame per crossed tick); slow-motion accumulation (rate 0.5); end-of-timeline normal stop; determinism (double-run deep-equal); frozen state/buffer copies detached from later mutation.
- playback.frames.test.ts (11): one record per declared kind in declaration order; tactical board delta (sorted-unique ids/entities, no geometry); play-by-play segments (anchors only, zero phrasing); honest empties; zero invention (every frame id is declared); the same event in both realities at the same tick; kind-tagged canonical activeEvents; verbatim carry-forward on every frame; deep freeze (machine-checked, incl. mutation TypeError); pure-pipeline determinism; segment order by declared sequence.
- playback.buffer.test.ts (7): capacity-bounded FIFO eviction; frozen detached copies; caller-owned transients; single opening frame; no unbounded accumulation over 150 seek/step ops (buffer ≤ capacity; state keys exactly the 11 documented fields); determinism after eviction; large batch = caller's choice.
- playback.composition.test.ts (8): the machine-checked adapter-boundary law (source scan: zero `@sporta/`, zero SWM-record tokens, empty dependencies); end-to-end both-realities replay with zero-invention + zero-loss coverage (union of active events over all ticks == declared set); second synthetic domain end-to-end (domain-extension law); error paths leaving the session intact; bounded buffer under composition; cross-session determinism; the honest example session; 3200 real frame projections with double-run deep-equal.

## REAL EVIDENCE

How measured (all on this sandbox, final pre-report runs):

- `pnpm architecture:check` → `architecture: OK / violations: 0 / baseline: 0 / new: 0` (exit 0). The new package is outside the registered set as designed (WO-C1; TL registers it at integration).
- `node scripts/architecture/sporta-surface-check.mjs` → `sporta-surface-check: OK — frozen surfaces intact, growth is additive-only` (all 13 registered modules ok; `sporta-render` is not in the frozen map yet — nothing frozen was touched).
- `pnpm exec tsc -b packages/sporta-render` → clean, exit 0, no output (also verified with the full scoped sporta set: exit 0).
- `pnpm exec tsx --test packages/sporta-render/test/*.test.ts` → `tests 54 / pass 54 / fail 0 / cancelled 0`, runner-measured real wall-time ~0.9 s (880–957 ms across runs).
- `pnpm exec tsx --test packages/sporta-*/test/*.test.ts` → `tests 372 / pass 372 / fail 0 / cancelled 0`, ~9.5 s real wall-time (baseline 318 + 54 new; the pre-work baseline re-measured 318/318 before any code was written).
- `pnpm lint` → `Found 70 warnings and 0 errors` — identical to the pre-existing baseline; my 14 new files add zero warnings/errors (2795 → 2809 linted files).
- `pnpm exec oxfmt --check packages/sporta-render/src packages/sporta-render/test packages/sporta-render/SPEC.md packages/sporta-render/CONTRACT.md` → all files use the correct format (matching w5b's oxfmt-clean scaffolding practice).
- Pure functions run for real: the controller/frames/index functions execute in the tests above (real wall-time as measured by node:test); `examplePlaybackSession()` measured 1.218 ms real wall-time via `performance.now()` in a real tsx run (frames retained: 7; playheadMs: 4000; atEnd: false).
- Determinism is asserted, not assumed: every determinism test drives two independent controller instances with identical inputs and deep-equals the full outputs.

## FIXTURE EVIDENCE

All timeline inputs across tests and examples are FIXTURE-GRADE (labeled in test headers and in contract.example.ts): synthetic football event ids ("event:kickoff", "event:pass-3", ...), synthetic snapshot hashes ("ab".repeat(32)), synthetic provenance ("camera:fixture-1"), synthetic rights holders, a synthetic second domain ("esports-sc2") for the domain-extension law, and a synthetic 40-event bulk timeline for the real-execution test. No production evidence is claimed; no ML model is loaded or executed; no perception happens here (that is w5a's lane). The fixtures satisfy the port shape that the real render models expose (w5b's branch was read for exact type names only — my code compiles against my own declarations).

## CONTRACT CHANGES

- None to any frozen surface (surface check OK; growth is additive-only).
- The new package's own SPEC.md/CONTRACT.md define the playback contract: the input port (`RenderTimelinePort`), the time model (half-open tick intersection), the controller semantics, the three buffer laws, the carry-forward read-only law, and the 14-error failure table. The v1 reality-kind vocabulary is closed ("tactical" | "play-by-play"); extension is additive (new port tag + new frame record, no controller redesign).
- No shared contract types were added across planes (per-package duplication law; zero `@sporta/*` dependencies).

## RIGHTS-PROVENANCE

- Every frame carries the timelines' carry-forward header verbatim: source summary (swmId/snapshotHash/domain), provenance summary (sourceKind/sourceRef/capturedAt/confidence) and rights-scope summary (holders/usages/prohibitions) — read-only, deeply frozen, never widened, never dropped (ADR wave-5, decision 5).
- One playback session = one snapshot's realities: timelines with disagreeing carry-forward headers are refused (`TimelineCarryMismatchError`) — playback never merges rights.
- Fail-closed carry validation mirrors the world module's law: confidence outside [0, 1] is a typed refusal; renderers/playback never invent confidence.
- Playback makes no rights decisions and no policy calls: it consumes the C6 vocabulary read-only and adds no usage contexts.

## PERFORMANCE

- Measured: 54 playback tests in ~0.9 s real wall-time; full 372-test battery in ~9.5 s; the composition test performs 3200 frame projections + 40 seeks deterministically well under that; `examplePlaybackSession()` 1.218 ms.
- Complexity (documented in SPEC alongside the memory law): index build O(E log E) (one sort); per-tick projection O(log E) binary search + bounded prefix scan, O(E) worst case, allocating only the active-event window; memory: input-sized index + capacity-bounded frame buffer (default 64) + one playhead + one rate — nothing else.

## SECURITY

- No IO, no network, no timers, no eval, no dynamic imports anywhere under `src/` (pure domain layer); all outputs deeply frozen (mutation attempts throw); all inputs validated fail-closed before any state change; no secrets, no credentials, no environment reads. The git remote URL used for push is not written into any committed file.

## RISKS

- The shared scaffolding files (package.json, tsconfig.json, module.ts, contract.ts, contract.example.ts, SPEC.md, CONTRACT.md) were created in parallel by w5b and w5c from the same base per the packet's orders; the TL must union them at integration (code paths themselves are strictly disjoint — mine under `src/domain/playback/` + `test/playback*.test.ts`). Resolution notes are in NEXT DEPENDENCIES.
- The timeline port REQUIRES per-event timestamps (`atMs`), while the v1 render models expose the record's own event order + a single capture anchor (timestamp honesty law). The integration-time composition adapter must derive `atMs` deterministically — the documented default is `sequence * tickMs`. This is a wiring decision, not an engine gap.
- `sporta-render` is unregistered in architecture-policy.yaml until the TL registers it; I self-complied with the managed-module laws (max 400 lines/file — largest is 296; contract.ts 75 lines; entrypoint-only surface; zero dependencies; no cycles; domain layering) so registration should be mechanical.
- Oxlint's `max-lines` counts non-blank/non-comment lines, but I held the stricter raw 400-line law (timeline.ts was split at 416 raw lines).

## BLOCKERS

None.

## DEVIATIONS

- timeline.ts initially landed at 416 raw lines; per the file-size law it was split into carry.ts (137) + timeline.ts (296) before delivery.
- oxfmt IS applied to SPEC.md/CONTRACT.md (matching w5b's oxfmt-clean scaffolding), while the repo's global docs are not oxfmt-clean (verified: docs/architecture/adr-wave5-p6-sports-production.md fails `oxfmt --check`) — package-local files follow the wave-5 package practice.
- The spec commit was amended once (dd01381) to add the `InvalidStepError` row to the failure table BEFORE any implementation commit existed (spec-before-code law preserved: the spec commit still precedes all code).
- `pnpm typecheck` (full-repo) remains OOM-killed on this 4 GB sandbox — the environment limitation recorded by the TL at Wave 0; the scoped `tsc -b` protocol is the agreed local verification (as in waves 1–4).

## NEXT DEPENDENCIES (work-order notes to the TL)

1. REGISTER sporta-render in architecture-policy.yaml (TL-owned): id `sporta-render`, roots `[packages/sporta-render/src]`, managed true, requires `[sporta-contracts]` (w5b's render-model surface consumes the frozen contracts; my playback surface itself requires none), publicEntrypoints `[packages/sporta-render/src/contract.ts]`, layers domain/app/adapters, layerOrder domain/app/adapters, owner worker-b (render models) with the playback surface noted as worker-c's. Then run a real `pnpm install` and re-run all gates.
2. MERGE w5b + w5c additive surfaces (both branches from e919f81): union `contract.ts` re-exports (w5b's render-model exports + my playback exports — no name collisions: their names are RealityKind/TacticalRenderModel/..., mine are Playback*/RenderTimeline*); union `module.ts` provides (add `"playback-engine"`); merge SPEC.md/CONTRACT.md sections; keep w5b's `@sporta/contracts` dependency + tsconfig reference; keep both test sets (disjoint filenames); union package.json scripts (identical).
3. COMPOSITION ADAPTER (the integration-time wiring the ADR assigns to the TL): project the real render models into `RenderTimelinePort` — tactical: kind "tactical", events from `TacticalRenderModel.timeline.events` with `atMs` derived per the documented default (`sequence * tickMs`) until the SWM carries per-event timestamps, `payloadRefs` from the board's entity associations; play-by-play: kind "play-by-play", events from `PlayByPlayRenderModel.records`; carry-forward from the models' shared header (already deep-equal across realities per w5b's two-realities materiality test, so my `TimelineCarryMismatchError` will not fire).
4. HOST WIRING: surface the playback frames inside the packages/web sporta shell behind the w4c host-conversion surface (transitional-symlink law; TL serialization).
5. OPTIONAL follow-ups: per-event timestamps in the SWM contract would make the composition adapter a pure pass-through (an ADR-level change); a clock-port adapter (app layer) could drive `advance` from real wall-time for live playback — deliberately NOT built now (the engine stays declarative-deterministic).

DELIVERY: branch wave5/worker-c @ e84dafb (implementation HEAD; the fmt commit 4ae4b7c and this report follow as branch HEAD — `git log wave5/worker-c -4`)

Gate table (real, measured on this sandbox, final pre-report run):

| Gate | Command | Result |
|---|---|---|
| Architecture | pnpm architecture:check | OK — violations 0, baseline 0, new 0 |
| Surface | node scripts/architecture/sporta-surface-check.mjs | OK — frozen surfaces intact, additive-only |
| Typecheck | pnpm exec tsc -b packages/sporta-render | clean, exit 0 (full scoped sporta set also exit 0) |
| Tests (render/playback) | pnpm exec tsx --test packages/sporta-render/test/*.test.ts | 54 pass / 0 fail / 0 cancelled |
| Tests (full sporta battery) | pnpm exec tsx --test packages/sporta-*/test/*.test.ts | 372 pass / 0 fail / 0 cancelled (baseline 318 + 54 new) |
| Lint | pnpm lint | 70 warnings, 0 errors (baseline identical; 14 new files add zero) |
| Format | pnpm exec oxfmt --check packages/sporta-render/{src,test,SPEC.md,CONTRACT.md} | all correct |
| File-size law | raw line counts | largest src file 296 lines (timeline.ts); all ≤ 400 |
