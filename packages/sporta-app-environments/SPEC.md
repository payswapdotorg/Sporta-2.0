# SPEC W9-C — Application Environments + Transform Studio UX

Worker `w9c`, branch `wave9/worker-c`, base `b97503d` (main after the W9-B merge).
Bound documents (never re-invented): `docs/architecture/adr-transform-studio-marketplace-and-application-environments.md`,
`docs/contracts/application-environment.md`, `docs/contracts/transform-marketplace.md`,
`docs/work-orders/transform-marketplace-work-orders.md` (Worker C section),
`docs/testing/transform-marketplace-acceptance.md` (P9-18..P9-23),
the frozen `packages/sporta-app-environments/src/contract.ts`, and the landed sibling
implementations `packages/sporta-transforms/src/**` (W9A) and `packages/sporta-marketplace/src/**` (W9B).

## Ownership (scope law)

- `packages/sporta-app-environments/**` (all of it, incl. `package.json`, tests, this SPEC).
- `packages/web/src/sporta/studio/**` (NEW directory).
- This report. Zero edits anywhere else; shared seams stay frozen.
- Architecture policy for this module (frozen by TL): `requires: [sporta-contracts, sporta-work, sporta-policy]`,
  layers `domain -> app -> adapters`, `publicEntrypoints: [src/contract.ts]`, `maxFileLines 400`, `maxContractLines 300`.
  `packages/web` is `managed: false` in the policy (architecture-check skips it); it is still held to the
  same layer discipline voluntarily (pure view-models + injected ports + render surface).

## Hard constraints honored

1. **Frozen surface (surface-check enforced)**: every frozen export of
   `src/contract.ts` stays byte-identical in name and shape — `ApplicationCapabilityClass`,
   `ApplicationTargetKind`, `ApplicationCapability`, `ApplicationEnvironmentDescriptor`,
   `ApplicationAttachment`, `ApplicationSession`, `ApplicationActionRecord`,
   `ApplicationActionAdmissionResult` + the `@sporta/contracts` re-exports. Additions only.
   `contract.ts` stays <= 300 lines; every src file <= 400 lines.
2. **Layer law**: `domain/` pure (no `node:` imports, no IO, injected clock/hash);
   `app/` adapter-free services; `adapters/` own ALL IO (REAL `node:crypto` sha256;
   REAL `node:child_process`/`node:http` where process/network legs are required;
   fixture adapters clearly fixture-labeled).
3. **Cross-module imports** (architecture-check enforced): only `@sporta/contracts`,
   `@sporta/work`, `@sporta/policy`, only via their public entrypoints. The artifact
   fabric is reached through a **structurally-typed port declared in my domain**
   (no `@sporta/artifacts` import in src); the demo composition passes the REAL
   `ArtifactGraphService` where that port is expected.
4. **ZCode is the only runtime** (lock 2/27/37): no second runtime, scheduler or
   permission authority. The agent leg goes through the REAL
   `ZCodeAgentRuntimeAdapter` from `@sporta/work` (the declared
   `AgentRuntimeExecutionPort` seam). The app-action tool surface is exposed to
   agent processes through a generic HTTP tool endpoint (adapters layer) — the
   same generic-boundary pattern as the Arena HTTP transport; it is
   capability-generic (takes `capabilityId`), never app-specific shell surface.
5. **Learning is separate consent** (lock 31): `ApplicationAttachment.learningConsent`
   stays a separate structure; attaching/granting never flips it.

## W9C-1 — descriptor registry (domain + app)

- `validateApplicationDescriptor` (pure): well-formedness — stable ids, unique
  `capabilityId`s per descriptor, `grantedCapabilityClasses`-independent class
  vocabulary, `networkNeeds` default-deny posture disclosure, health status, and
  the launch-requirement/limitation disclosures present.
- `ApplicationEnvironmentService` (app): `registerDescriptor` (validated, stored),
  `verifyTarget` (delegated to the adapter port — a REAL probe in the local
  adapter), `readDescriptor`, `listDescriptors`. Descriptor identity is
  `(applicationId, appVersion, targetIdentity)`; re-registering the same identity
  with a DIFFERENT capability catalog is a typed error (broader permissions on a
  new release require reauthorization — security law 3).

## W9C-2 — scoped grants / attachments (domain + app)

- `consentToAttach` (app, over pure `grants.ts`): builds an `ApplicationAttachment`
  from user consent input. Laws:
  - `grantedCapabilityClasses` must be a subset of the descriptor's declared
    classes, deduped, EXACT (no widening; "observe" never silently adds "control").
  - expiry (`expiresAt`) required and strictly after `grantedAt`; `policySnapshot` recorded.
  - `learningConsent` defaults to `{ granted: false }`; granting it is a separate
    explicit call with scope + retention (lock 31; P9-22).
  - scope: workspace + optional single `workGraphId` (run-scoped grants).
- `revokeAttachment`: sets `revokedAt` (idempotent); revocation blocks NEW actions
  and triggers session safe-stop (W9C-5). Expiry is evaluated at admission time
  against the injected clock (never trusted from the record alone).
- `attachmentIsActive` (pure): revoked/expired evaluation used by the ladder.

## W9C-3 — deterministic action admission ladder (domain)

`admitApplicationAction` (pure) walks a FIXED order and returns the frozen
`ApplicationActionAdmissionResult`:

1. capability declared by the descriptor? else `capability-not-declared`;
2. its class granted by the active attachment? else `capability-class-not-granted`;
3. attachment revoked? `attachment-revoked`;
4. attachment expired (clock)? `attachment-expired`;
5. session open (not closed/expired/disconnected)? `session-closed`;
6. sandbox policy (declared `networkNeeds`/data classes vs the capability's
   `requiredPermissions` and a policy predicate)? `sandbox-policy-denied`;
7. instruction-injection screening over the input refs/payload markers?
   `instruction-injection-suspected` (P9-21: app content can never expand
   permissions — a payload carrying grant-expansion directives is refused).

Admitted control-class capabilities whose declared side effects intersect the
high-impact set (destructive/irreversible/public-posting/purchase/publishing/
billing/permission-change) return `requiresConfirmation: true` with the mapped
`confirmationClass` (security law 5). The ladder is deterministic: same inputs,
same order, same result — tested by exhaustive order pinning.

## W9C-4 — bounded session lifecycle (domain + app)

- `openSession`: one session over one ACTIVE attachment; `activeGrants` snapshot
  = the attachment's granted classes at open time; `versions` from descriptor +
  adapter; `auditStreamRef` derived deterministically.
- `checkpointSession`: append-only `checkpointRefs`.
- `closeSession(reason)`: `closeState` law — `closed-clean` ONLY on explicit clean
  close; `revoked-mid-session` when the attachment was revoked while open;
  `expired` when the grant expired under it; `disconnected` when the target
  probe failed — **a disconnected app is never "successful"** (contract law;
  P9-19): sessions closed as `disconnected` are flagged so no action record may
  claim success against them.
- Safe-stop on revocation: the session service marks every open session of a
  revoked attachment `revoked-mid-session` (blocks new actions, keeps audit).

## W9C-5 — action audit + the app action service (app)

`ApplicationActionService.performAction` is the single orchestrator
(admission -> execution -> verification -> reconciliation -> audit):

1. run the W9C-3 ladder; a denial writes a DENIED `ApplicationActionRecord`
   (decision trail `not-granted`/`revoked`/`expired`/...) and returns the typed
   refusal — never throws for policy denials;
2. execute through the injected `ApplicationCapabilityInvocationPort` (the
   generic tool seam; REAL local adapter in W9C-7);
3. verify the effect through the adapter's before/after evidence (P9-19);
   a failed/disconnected invocation records `status: "failed"` with
   `missingCoverageNote` set — never success;
4. reconcile the VERIFIED effect through the injected
   `ApplicationEffectSinkPort`: immutable artifact revision + WorkGraph
   `artifact-revision` ref append on the SAME WorkGraph the run used;
5. append the `ApplicationActionRecord` (sanitized refs only — no payloads,
   no secrets; P9-21) to the append-only audit store.

Audit laws (pure `audit.ts`): append-only (ids unique, no mutation API),
records carry the permission decision trail, effects marked `verified` only
from real before/after evidence, and `reconciledRefs` only from the sink result.

## W9C-6 — REAL adapters (adapters layer)

- `clock.ts`: `systemClockNow` + `FixedClock` (sibling precedent).
- `hash.ts`: REAL `node:crypto` sha256 (`sha256Text`, `Sha256AppEnvironmentHash`).
- `inMemoryAppEnvironmentStore.ts`: in-memory stores for descriptors,
  attachments, sessions, audit (fixture-grade stores; the SERVICES and laws are
  real — the sibling `InMemory*Store` precedent, clearly labeled).
- `localAppAdapter.ts` — the REAL local application adapter: spawns the REAL
  app executable (a real local process per action, real pipes, real exit codes)
  — `describe` (real probe -> descriptor mapping), `invoke` (real action spawn),
  `observeEffect` (REAL fs read of the app's own state file, before/after).
  Sandbox posture: the app process is spawned with a constrained env and cwd
  inside its own directory; observation of effects is read-only.
- `agentToolEndpoint.ts` — the generic app-action tool endpoint for agent
  processes: REAL `node:http` server on 127.0.0.1 (OS-assigned port) that
  admits/executes/verifies/reconciles through the injected
  `ApplicationActionService` and answers with a typed JSON result. This is the
  demo wiring of the ZCode generic tool boundary for attached apps (browser/
  terminal remain ZCode's; no app-specific shell surface is created).

## W9C-7 — REAL local app action over the real agent/tool path

Demo composition (battery test, W4A/W9A process-leg precedent):

- The local app is a REAL program (test-authored fixture CONTENT, clearly
  labeled; its PROCESS and EFFECTS are real): a local "tag board" app keeping
  highlighted moments in its own real JSON state file; actions `read-status`
  (observe) and `append-highlight` (control, real state mutation).
- The adapter verifies the target by really probing the app (`describe`),
  maps its declared actions to the frozen capability vocabulary, and the user
  (test) consents to `observe` + `control` SEPARATELY (P9-18).
- The agent leg: the REAL `ZCodeAgentRuntimeAdapter` (from `@sporta/work`)
  spawns a REAL agent process (the zcode-cli headless double — real spawn,
  real pipes, real stream-json events, real exit code) which performs the app
  action by calling the generic tool endpoint over REAL localhost HTTP
  (the tool URL is passed through the agent environment — the adapter's real
  `env` propagation). The endpoint runs MY admission ladder, the REAL app
  action, REAL effect verification, and REAL reconciliation into the SAME
  WorkGraph + artifact lineage the pipeline run used.
- Revocation proof (P9-20): after `revokeAttachment`, the next agent-driven
  tool call is refused with the typed `attachment-revoked` reason through the
  same path, the app state file is unchanged, the audit record says `denied`,
  and the session is `revoked-mid-session` — all asserted on real artifacts.

## W9C-8 — Transform Studio UX (packages/web/src/sporta/studio/**)

Follows the SportaPanel surface law (build-verified render surface + injected
host port + honestly-labeled evidence):

- `studioPorts.ts` — TYPE-ONLY host seam: the studio host port the composition
  implements (validation reads, marketplace reads, launch admission, attached-app
  reads). Browser-safe (type imports only).
- Pure view-model modules (NO react import — battery-tested from
  `packages/sporta-app-environments/test/` via relative imports, plus an ad-hoc
  `tsc --noEmit` type-compat proof against the REAL sibling contracts):
  - `graphStudio.ts` — graph building blocks (nodes/edges assembly, port
    compatibility hints) + the validation view-model mapping that CONSUMES the
    `@sporta/transforms` validation result shape (`TransformGraphValidation`)
    and projects violations for display;
  - `marketplaceViews.ts` — listing/review status/disclosure view-models
    consuming the `@sporta/marketplace` read shapes (review decision, listing,
    launch disclosure incl. the fixed legal notice, licenses, limitations,
    price/terms, evidence grade);
  - `launchSelection.ts` — the launch-time pipeline selection state machine
    (disclosure shown -> user confirms -> admission result surface, typed
    refusals rendered verbatim);
  - `appAttachmentViews.ts` — attached-app permissions/data-scope/grant/expiry/
    learning-consent views (the P9-12-style disclosure for apps).
- React render surfaces (build-verified; `tsc -b packages/web`): 
  `TransformStudio.tsx`, `StudioMarketplacePanel.tsx`, `StudioLaunchPanel.tsx`,
  `StudioAppAttachmentsPanel.tsx` + `studio.css` (SportaPanel CSS precedent).
- `README.md` — the TL integration seam (how the panel composition mounts the
  studio; NOT wired into `SportaPanel.tsx` in this lane — zero-edit scope law).

## W9C-9 — Vertical-slice demonstration (battery test)

One coherent lineage (P9-23): local prerecorded feed (real bytes) ->
W9A REAL deterministic filter node (real child process) + W9A fixture model
adapter (fixture-labeled) -> REAL WorkGraph + artifact revisions (run manifest
pinned to the reviewed release digest) -> W9B reviewed FREE listing (draft ->
submit -> clean automated gates -> 3-role human review -> publish ->
entitlement) -> feed-launch admission (rights snapshot) -> pinned run ->
attached REAL app action over the real agent/tool path (W9C-7) reconciled onto
the SAME WorkGraph -> revocation blocks the next action. Digest byte-equality
from decision -> listing -> entitlement -> run manifest is asserted.

## Verification (all pasted in the report)

- `pnpm exec tsc -b packages/sporta-app-environments` and `pnpm exec tsc -b packages/web` (exit 0)
- `node scripts/architecture/sporta-surface-check.mjs` (frozen names present)
- `node scripts/architecture/architecture-check.mjs check` (0/0/0)
- `pnpm exec tsx --test packages/sporta-app-environments/test/*.test.ts` (0 fail)
- FULL BATTERY `pnpm exec tsx --test packages/*/test/*.test.ts` (>= 800 pass; the
  one pre-existing `packages/ui` alias-resolution failure at base `b97503d` is
  documented, evidenced on the clean base, and left to its owner — outside this
  lane's roots)
- `pnpm exec oxlint` (0 errors; warnings <= 70 baseline, no new warnings)
- Ad-hoc type-compat proof: `tsc --noEmit` over the studio compat module against
  the REAL `@sporta/transforms`/`@sporta/marketplace` contract shapes.

## Evidence labeling

REAL: process legs (agent spawn, app spawn, HTTP tool call), sha256 digests,
admission/audit records, WorkGraph/artifact reconciliation, digest byte-equality.
FIXTURE (labeled): test manifests/feeds/app program content, reviewers, in-memory
stores, the fixture model lane, the zcode-cli headless double (real process,
fixture-labeled agent content).
