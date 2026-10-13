# sporta-app-environments — SPEC (P9 Wave 9, Worker C)

Spec-before-code record for **W9C-1..W9C-7**: the generic application
descriptor registry with observe/control/semantic-binding capability
declarations, scoped user grants with expiry/revocation and separate
learning consent, the bounded ApplicationSession lifecycle with the
closeState law, the append-only ApplicationActionRecord audit trail with
deterministic typed-refusal admission, ONE real local app action over the
real ZCode agent/tool path whose verified effect is reconciled into the
existing WorkGraph/artifact lineage, and the Transform Studio product UX
(packages/web/src/sporta/studio/**) that consumes the @sporta/transforms
validation port, the @sporta/marketplace read ports and this module.
Authority order:
`docs/work-orders/transform-marketplace-work-orders.md` ->
`docs/architecture/adr-transform-studio-marketplace-and-application-environments.md` ->
`docs/contracts/application-environment.md` ->
`docs/testing/transform-marketplace-acceptance.md` (P9-18..P9-23).

The repository is the source of truth; this file states behavior, ownership,
invariants and failure semantics BEFORE implementation. Scope law: only
`packages/sporta-app-environments/**` and `packages/web/src/sporta/studio/**`
plus this report. The TL-frozen names in `src/contract.ts` stay untouched;
everything below appends public names additively behind them (surface check
stays green). `src/module.ts` `requires` stays exactly
`[sporta-contracts, sporta-work, sporta-policy]` — the architecture-policy
frozen direction.

## Layer law

`domain` is pure (no `node:` imports, no IO, no timers, no ambient time);
`app` composes domain types/ports plus cross-module public contracts
(`@sporta/contracts`, `@sporta/work` — the declared requires) and imports NO
adapter module; `adapters` own all real IO (`node:crypto` sha256, real local
directories) and every in-memory fixture store. The artifact-revision and
WorkGraph seams are INJECTED ports declared in this module's domain
(structurally satisfied by the existing `ArtifactGraphService` /
`WorkGraphService`); this package adds no second artifact or task authority.
Wiring happens at the composition roots (tests + the studio composition),
never inside the layers. Timestamps come only from an injected clock; digests
only from an injected hash port.

## W9C-1 — Descriptor registry + capability declarations (P9-18)

- `validateApplicationEnvironmentDescriptor` (domain, pure) fail-closed
  checks a frozen `ApplicationEnvironmentDescriptor`: unique capabilityIds,
  well-formed inputs/outputs/sideEffects/failures, a valid
  `ApplicationTargetKind`, `networkNeeds` one of `none|narrow-allowlist`,
  healthy-shaped `health` (ISO-8601 `checkedAt` + known status), non-empty
  `licensing`, a `PolicySet`, and arrays for launch/data/limitations.
  Violations are typed `{kind, detail}` entries in a deterministic order
  (mirrors the w9a graph validator idiom).
- Capability classes stay INDEPENDENT: a descriptor declaring an `observe`
  capability never implies control; `file-transfer` and `network-access`
  are separate explicit classes (lock 30/32).
- `DescriptorRegistryService` (app) registers validated descriptors into an
  injected store; `verifyTarget` reads real target state through the
  `ApplicationTargetStatePort` (the adapter owns the real IO) and refuses
  unreachable targets honestly (`unreachable` health never registers as
  healthy). Registration is idempotent per `descriptorId`.

## W9C-1 — Scoped grants, expiry, revocation, separate learning consent

- `AttachmentService.attachApplication` records the frozen
  `ApplicationAttachment`: granted classes MUST be a subset of the
  descriptor's declared capability classes (granting an undeclared class is
  a typed `ApplicationAttachmentError` `class-not-declared`); `expiresAt`
  MUST be after `now` (typed `expiry-not-future`); scope is
  workspace/WorkGraph-scoped; `learningConsent` is ALWAYS
  `{granted:false}` at attach time (lock 31: attachment alone never learns).
- `amendGrant` broadens `grantedCapabilityClasses` ONLY with a new explicit
  consent input (the reauthorization law); the amended set is re-validated
  against the descriptor.
- `grantLearningConsent` is a SEPARATE explicit write path; it flips
  `learningConsent` to `{granted:true, scope, retention}` and nothing else.
  `revokeLearningConsent` resets it to `{granted:false}`. No app action path
  ever reads or writes learning consent.
- `revokeAttachment` sets `revokedAt` and — the safe-stop law (P9-20) —
  closes every still-active session of that attachment with closeState
  `revoked-mid-session` (checkpoint refs preserved). Revocation is
  idempotent.
- Expiry is a LIVE check: every admission compares the injected clock to
  `expiresAt` (an expired attachment never admits; the predicate
  `isAttachmentExpired` is exported for callers).

## W9C-2 — ApplicationSession lifecycle + closeState law (P9-19/20)

- `AppSessionService.openSession` requires an attachment that is not
  revoked/expired at open time; `activeGrants` snapshot the attachment's
  granted classes; `versions` pin app/adapter/target; `auditStreamRef` is
  derived deterministically.
- `closeSession` accepts ONLY terminal close states
  (`closed-clean|revoked-mid-session|expired|disconnected`). The closeState
  vocabulary itself enforces the honesty law: `disconnected` is a NON-SUCCESS
  state — a disconnected app is never reported successful (the audit records
  of a disconnected session carry `status: failed` or `denied`, never
  `succeeded`). Closing an already-closed session is a typed
  `ApplicationSessionStateError`.
- `appendCheckpoint` appends refs to `checkpointRefs` (append-only, never
  rewritten).

## W9C-3 — Deterministic action admission ladder (P9-18/21)

`admitApplicationAction` (domain, pure) evaluates the frozen
`ApplicationActionAdmissionResult` in a FIXED first-match order:

1. `capability-not-declared` — the descriptor has no capability with the
   requested `capabilityId`, or its class differs from the request's class.
2. `capability-class-not-granted` — the requested class is not in the
   attachment's `grantedCapabilityClasses` (observe never implies control).
3. `attachment-revoked` — `revokedAt != null`.
4. `attachment-expired` — `now >= expiresAt` (injected clock).
5. `session-closed` — `session.closeState !== "active"`.
6. `sandbox-policy-denied` — the capability's `requiredPermissions` are not
   covered by the caller-supplied session permission set (the ZCode
   permission boundary), or the descriptor needs `narrow-allowlist` network
   egress and the request carries no explicit network allowance
   (default-deny).
7. `instruction-injection-suspected` — the payload/inputRefs contain
   permission-expansion instruction patterns (a fixed deterministic list —
   "grant ", "expand permission", "ignore previous", "you are now",
   "bypass", "escalate privilege", "disable sandbox"). App content can never
   expand permissions (P9-21).

On admission, capabilities whose `sideEffects` contain destructive markers
require confirmation: a fixed side-effect → confirmationClass mapping
(`destructive > irreversible > public-posting > purchase > publishing >
billing > permission-change`, deterministic first-match) yields
`{admitted:true, requiresConfirmation:true, confirmationClass}`. The
service executes a confirmation-required action ONLY when the caller passes
`confirm:true`.

## W9C-4 — Append-only audit trail (P9-19/21)

- Every admission outcome (allowed, denied, requires-confirmation) is
  recorded as a frozen `ApplicationActionRecord`; the audit store is
  append-only (same `actionRecordId` re-append is idempotent; a DIFFERENT
  record under the same id is a typed `ApplicationAuditConflictError`).
- `actionRecordId` is deterministic (fnv1a over stable content) — retries
  never duplicate.
- Records carry ONLY sanitized refs: `sanitizeActionRefs` drops
  secret-shaped refs (token/credential/password/api-key/secret keywords or
  non-ref-shaped strings); dropped refs surface in `missingCoverageNote`
  (never silent).
- Denied records map refusal reasons onto the frozen
  `permissionDecision.basis` vocabulary
  (`not-granted|revoked|expired|requires-confirmation`) with the precise
  reason kept in `detail`; the status is `denied` — never `succeeded`.

## W9C-5 — ONE real local app action over the REAL agent/tool path

`AppActionService.executeAppAction` composes the existing boundaries — no
second runtime (lock 37):

1. Load descriptor/attachment/session; run the domain admission ladder.
   Denied → append the denied audit record; no execution.
2. Read the target state BEFORE through `ApplicationTargetStatePort` (the
   adapter performs the real read; digest = real sha256 of real bytes).
3. `startRun` on the injected `AgentRuntimeExecutionPort` — the EXISTING
   ZCode boundary (`@sporta/work` `ZCodeAgentRuntimeAdapter` spawns the real
   CLI process). The task embeds a machine-readable action directive
   (capability, target identity, target workspace path, sanitized payload);
   the executable is caller-supplied — the real zcode-cli in production, a
   REAL stand-in process speaking the same headless interface in the sandbox
   (the vendored zcode-cli is unbuildable here — the W4C blocker, labeled).
4. Poll `observeRun` to the terminal event (the work adapter's law: the
   verdict is the real process exit code). No terminal event inside the
   deadline → the action FAILS (`missingCoverageNote` says so) — a
   disconnected app is never successful (P9-19).
5. Read the target state AFTER; verify the effect: run verdict `completed`
   AND state digest changed AND a new observation of a declared
   side-effect kind. Anything else is `status: failed` with unverified
   effects — never success.
6. On VERIFIED success reconcile into the EXISTING lineage: commit an
   artifact revision for the evidence bytes through the injected
   artifact-revision port, append the agent-run + action nodes through the
   `WorkGraphPort`, and `commitArtifactRevision` through `WorkGraphRefsPort`
   onto the SAME WorkGraph node that carries the run's lineage (P9-19).
   `reconciledRefs` carries the workGraphId + revision ids.
7. Append the audit record (allowed path, verified effects, sanitized refs,
   checkpoint ref appended to the session).

Learning law: this service NEVER creates learning artifacts and never
consults `learningConsent` (lock 31 — separate consent path only).

## W9C-6 — Transform Studio UX (packages/web/src/sporta/studio/**)

- `studioPorts.ts` (type-only): the studio surface law — one read state +
  typed write paths (graph edits, validate, sample preview, marketplace
  reads, launch selection, app attach/amend/revoke/act). Evidence grade
  surfaced IN the state ("real" | "fixture").
- `studioGraph.ts`: the editable graph builder producing a
  `TransformPipelineManifest` from a component palette (the REAL w9a trim
  component digest computed through the real hash port; the fixture model
  node; the application-environment-action node — the deferred lane is an
  honest typed failure in the first slice).
- `studioComposition.ts` (HEADLESS Node — NEVER enters the browser bundle):
  wires the REAL @sporta/transforms validation + deterministic execution
  lane, the fixture-labeled model lane, the @sporta/marketplace read/admission
  services with in-memory fixture stores (real services + real sha256), and
  THIS module's app-environment services over the real agent path. It seeds
  the demo world (fixture-labeled) exactly like the W4C composition law.
- `StudioPanel.tsx`: BUILD-VERIFIED/UNTESTED React surface (the repo's
  honesty label — no browser harness exists) rendering: graph + typed
  validation violations, sample preview with evidence grades,
  marketplace/review status (listing state, version history, review
  decisions), the launch disclosure (publisher, approved version + digest,
  terms/price, rights prerequisites, dependencies, outputs, limitations,
  cost/latency + evidence grade, review date, the fixed legal notice), the
  admission/result surfaces, and the app permission panel (granted classes,
  data scope, learning-consent state, the audit trail). Mounting the panel
  into the app shell is a TL seam (outside this lane's owned roots).
- `studioFixtureHost.ts`: the labeled fixture host for a browser route
  (static snapshot; "FIXTURE HOST" badge — the Node legs cannot run in a
  browser bundle).

## W9C-7 — Vertical slice (P9-23)

One end-to-end demonstration test inside the owned roots: local
prerecorded feed (fixture content) -> graph validation (REAL w9a validator)
-> reviewed free listing through the REAL w9b services (draft -> submit ->
checks -> 3-role review -> publish; in-memory stores fixture-labeled) ->
feed-launch admission with a satisfying rights snapshot -> pinned
`TransformRunService` run (REAL deterministic child process; fixture model
lane labeled) -> output revisions reconciled onto the SAME WorkGraph ->
ONE real attached app action over the real agent path (W9C-5) with its
verified effect reconciled into the SAME WorkGraph/artifact lineage ->
revoke -> next action denied. Byte-equality of the release digest is
asserted from decision -> listing -> entitlement -> admission -> run
manifest.

## Failure semantics (deterministic order)

| condition                                | outcome                                                  |
| ---------------------------------------- | -------------------------------------------------------- |
| malformed descriptor                     | typed violations, registration refused                    |
| grant of an undeclared class             | typed `ApplicationAttachmentError` `class-not-declared`   |
| `expiresAt <= now` at attach             | typed `ApplicationAttachmentError` `expiry-not-future`    |
| attach/act on unknown descriptor         | typed `ApplicationUnknownRecordError`                     |
| grant broader classes without consent    | typed `ApplicationAttachmentError` `consent-required`     |
| close an already-closed session          | typed `ApplicationSessionStateError`                      |
| non-terminal close state requested       | typed `ApplicationSessionStateError`                      |
| any ladder refusal                       | frozen typed reason + denied audit record, no execution   |
| confirmation-required, not confirmed     | `requires-confirmation`, no execution                     |
| agent run fails / no terminal event      | `status: failed`, effects unverified, NO reconciliation   |
| effect not observed after a clean exit   | `status: failed`, never success (P9-19)                   |
| audit id collision with different bytes  | typed `ApplicationAuditConflictError`                     |
| revoked attachment                       | safe-stop closes sessions `revoked-mid-session`; refusal  |

## Honest evidence

- REAL: node:crypto sha256 digests; the agent-path child process (real
  spawn/pipes/exit code — the executable is the labeled stand-in speaking
  the zcode-cli headless interface, same law as W4C); the local app target
  state reads/writes (real files, real bytes); the w9a validator, the w9a
  deterministic lane, the w9b services and state machines; WorkGraph and
  Artifact Fabric services; byte-equality assertions.
- FIXTURE (labeled): in-memory stores, the FixedClock, the demo seed
  content (feed bytes, manifest content, reviewers), the
  FixtureTransformModelAdapter model lane, the stand-in executable WHAT it
  is (the process itself is real), the studio fixture host.

## Limits (first slice, declared)

- One local app target kind (`local`) is exercised end-to-end;
  remote/browser-hosted/native/service targets remain declared-but-fixture
  (the port law is proven by the local lane).
- The application-environment-action transform lane stays
  `capability-lane-deferred` in w9a's plan; the attached-app step of the
  vertical slice runs through the app-action service (this module), not as
  a transform node — the TL seam composes both later.
- Live feed ingress is fixture-labeled (P9-25): the studio launch surface
  marks `prerecorded` runs real-lane and `live` runs fixture-lane; no
  production-live claim.
- No new shell surface: the StudioPanel is exported for TL mounting; the
  existing app shell files are outside this lane's owned roots.
