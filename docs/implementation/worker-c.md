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
