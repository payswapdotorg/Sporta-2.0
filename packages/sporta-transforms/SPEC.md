# sporta-transforms — SPEC (P9 Wave 9, Worker A + P10 Wave 10, Worker A)

Spec-before-code record for **W9A-1..W9A-4**: typed DAG validation,
graph resolution into a bounded execution plan, the REAL deterministic
node execution lane, the provider-neutral model adapter lane, and the
transform-run manifest. Authority order:
`docs/work-orders/transform-marketplace-work-orders.md` ->
`docs/architecture/adr-transform-studio-marketplace-and-application-environments.md` ->
`docs/contracts/transform-marketplace.md` ->
`docs/testing/transform-marketplace-acceptance.md` (P9-01..P9-06).

Spec-before-code record for **W10A-1..W10A-4** (appended before any
W10-A implementation, per the SPEC-first law): live-feed ingress at
the REAL-local grade over the TL's Wave 0 frozen live-ingress surface.
Authority order:
`docs/work-orders/p10-integration-reality-work-orders.md` (Lane W10-A) ->
`docs/architecture/adr-p10-integration-reality.md` (rules 13-16) ->
`docs/contracts/transform-marketplace.md` ->
`docs/testing/p10-acceptance.md` (P10-01..P10-05).
The frozen live-ingress names (`LiveSourceGrade`, `LiveSourceDescriptor`,
`LiveFrame`, `LiveIngressRefusalKind`, `LiveIngressRefusal`,
`LiveCloseReason`, `LiveSessionEvidence`, `LiveSourcePort`,
`LiveSessionHandle`, `validateLiveSourceDescriptor` — TL-seeded in
`src/domain/liveSource.ts` @ Wave 0) are untouched; every W10-A
addition appends new public names behind them.

The repository is the source of truth; this file states behavior,
ownership, invariants and failure semantics BEFORE implementation.
Scope law: only `packages/sporta-transforms/**`. The TL-frozen contract
names in `src/contract.ts` stay untouched; everything below appends
public names additively behind them.

## Scope

- W9A-1 `src/domain/graphValidation.ts` — manifest + typed DAG validation
  (P9-01, fail-closed).
- W9A-2 `src/domain/executionPlan.ts` — resolution of a validated DAG
  into a bounded, deterministic execution plan + typed plan refusals.
- W9A-3 `src/adapters/deterministicFilterNode.ts` (REAL child-process
  lane, P9-02/P9-05) and `src/adapters/fixtureModelAdapter.ts`
  (provider-neutral model lane; FIXTURE evidence grade, honestly
  labeled).
- W9A-4 `src/app/transformRunService.ts` — bounded execution, per-step
  records, `TransformRunManifest` pinning (P9-03), semantic/event
  carry-forward evidence (P9-04), outputs as immutable Artifact Fabric
  revisions (P9-06).

Layer law: `domain` is pure (no `node:` imports, no IO, no timers);
`app` depends only on domain types/ports plus cross-module public
contracts; `adapters` own all real IO (`node:child_process`,
`node:fs`, `node:crypto`). Wiring happens at the composition root
(tests/product), never inside the layers.

## W9A-1 — Validation law (fail-closed)

`validateTransformPipelineManifest(manifest, options?)` returns the
frozen `TransformGraphValidation`. A valid graph returns
`{ valid: true, nodeCount, edgeCount }`. Every violation is typed:

| kind                 | fired when                                                                 |
| -------------------- | -------------------------------------------------------------------------- |
| `duplicate-node`     | two nodes share a `nodeId`                                                 |
| `unknown-node`       | an edge endpoint references a node id not declared in `nodes`               |
| `unknown-port`       | an edge endpoint references a port not declared on that node               |
| `type-mismatch`      | an edge's `from`/`to` port `dataKind` differ                               |
| `unpinned-component`| a node's `componentRef.digest` is not `sha256:<64 hex>` (moving tags, empty, "latest", "main", "HEAD" included) |
| `cycle`              | the edges form a cycle                                                     |
| `missing-parameter`  | a malformed `parameterSchema` entry, OR a provided parameter that is missing-but-required, wrongly typed, below `minimum` or above `maximum` |

Check order is deterministic: duplicate-node, unknown-node,
unknown-port, type-mismatch, unpinned-component, cycle,
missing-parameter; within a kind, by detail. ALL violations are
reported (not just the first).

Parameter checking contract: `parameterSchema` is the JSON-schema-ish
subset `{ type: "number" \| "integer" \| "string" \| "boolean", required?, minimum?, maximum?, default? }`.
Entries outside that shape are `missing-parameter` violations
(fail-closed on malformed schemas even with no run-time values).
When `options.parameters` carries per-node values, each node's values
are checked against its schema: missing required, wrong `type`,
`minimum`/`maximum` bounds (numbers only). Without run-time values,
only schema well-formedness is checked — the run service ALWAYS
validates again with the run's parameters, so execution is fail-closed.

## W9A-2 — Resolution and the bounded plan

`resolveTransformExecutionPlan(manifest, components, options?)` first
re-validates the manifest (with parameters) — invalid graphs throw the
typed validation error, never a half-plan. Then it resolves:

- **Step order**: Kahn topological sort, tie-break by node declaration
  order — deterministic for identical manifests.
- **Step budget**: `options.maxSteps` (default: node count). A plan
  needing more steps than the budget is a typed refusal
  (`step-budget-overflow`) — plans can never loop.
- **Lanes**: `deterministic-filter`/`script` -> `deterministic-process`
  (resolved through the component store); `model` -> `model-adapter`;
  `sporta-capability`/`application-environment-action` ->
  `capability-lane-deferred` (first-slice honesty: the lane exists in
  the plan, execution records a typed failure, never a silent pass).
- **Resource projection**: sum of declared `maxOutputBytes`;
  per-node placement by declared `cpuClass`/`memoryMiB`.
- **Component resolution**: every `deterministic-filter`/`script`
  node's `componentRef` must resolve in the component store by name
  AND digest — otherwise the typed refusal
  `unresolvable-pinned-dependency`.
- **Sandbox gate**: `container`/`worker` sandbox kinds are unsupported
  in this slice (`sandbox-unsupported` refusal); `none` is legal only
  for `sporta-capability` nodes (declared-trusted); any node requesting
  host secret access, or `allowlisted` network egress it cannot honor,
  is refused at plan time.

`TransformExecutionPlanError.refusalKind`:
`unresolvable-pinned-dependency | step-budget-overflow | sandbox-unsupported`.

## W9A-3 — REAL deterministic node (P9-02/P9-05)

The built-in component `json-event-stream-trim` v1 is a pinned script
(digest = sha256 of the exact source) owned by the component store.
Executing a `deterministic-filter` node means:

1. Resolve the node's `componentRef` in the store; re-verify the
   stored source still hashes to its digest (fail-closed on store
   corruption).
2. Create a REAL temp dir (`fs.mkdtemp`), write the REAL input file
   (bytes in) and the component script.
3. Spawn `process.execPath` (a real local child process, the
   zcodeAgentRuntime precedent) with env `{}` — NO host secrets, NO
   network — and `timeout: node.resources.timeoutMs` (SIGTERM kill).
4. The child trims the NDJSON event stream: events whose `atMs` is
   within `[startMs, endMs]` are kept and copied VERBATIM (byte-exact
   line carry-forward: identity, order, timestamps, confidence,
   provenance untouched); dropped events are counted; malformed input
   fails closed (non-zero exit + typed error JSON).
5. The adapter reads the real output bytes, enforces
   `resources.maxOutputBytes` (overflow = typed failure), and records
   REAL resource evidence from the child's `process.resourceUsage()`
   (cpu ms, maxRSS MiB) plus real wall-clock timing.
6. Cancellation (`AbortSignal`): before spawn -> `cancelled`, nothing
   spawned; during the run -> child killed, `cancelled`, output never
   committed. Timeouts and spawn errors are typed failures.

## W9A-3 — Model lane (provider-neutral)

`TransformModelPort.invokeModel(input)` returns
`{ output | refusal }` plus `evidenceGrade: "real" | "fixture"`,
provider id, cost and timing. Refusal kinds mirror the compute
precedent: `provider-unavailable | quota-exhausted |
credentials-missing | policy-denied | unsupported-operation`.

First slice ships `FixtureTransformModelAdapter` — deterministic,
clearly labeled `evidenceGrade: "fixture"`, `cost: null` (no fake
spend). A REAL provider adapter plugs the same port later without
contract changes. Fixture evidence is never reported as REAL.

## W9A-4 — Runs, carry-forward and the run manifest

`TransformRunService.runPipeline(input)` is the single owner of run
assembly:

1. Validate the manifest WITH the run parameters (fail-closed typed
   error; invalid graphs never execute).
2. Resolve the bounded plan (typed plan errors surface as thrown
   refusals, never partial runs).
3. Execute steps in plan order. Chain semantics for the first slice:
   each step consumes the last successful upstream output; the initial
   input is the run input artifact. A failed step stops later steps
   (fail-closed), while ALREADY-COMMITTED outputs stay readable
   (observable partial output, P9-05).
4. Model-node refusals respect the node's declared `errorBehavior`:
   `declared-fallback` -> step status `fallback-used` (identity
   pass-through, labeled in the detail); otherwise `typed-failure`.
   Never silent.
5. Every succeeded step commits its output through the EXISTING
   `ArtifactGraphPort` as an immutable, content-addressed revision
   (`derived-only` editability; provenance = the input descriptor
   carried forward, or a synthesized `measurement` descriptor pointing
   at the input artifact). Prior revisions are never rewritten.
6. The `TransformRunManifest` pins: release digest (caller-provided or
   the manifest digest), per-node component digests, and a non-secret
   config hash (sha256 over stable-stringified parameters + run
   options). The input TYPE has no secret fields; secrets never enter
   run records.
7. `semanticFidelity.grade`: `measured` when the deterministic lane ran
   and the runner re-verified carry-forward (kept events byte-equal,
   order preserved, drops counted); `fixture` when the fixture model
   lane produced output; `declared` otherwise. The note always states
   what was measured.

Step results use the frozen `TransformStepResult` shape verbatim.
Event-stream evidence (P9-04): the runner re-verifies the deterministic
trim in-process (structural comparison of input vs output events) and
records kept/dropped counts in the output's semantic evidence string.

## Failure semantics (event order)

| condition                      | outcome                                                        |
| ------------------------------ | -------------------------------------------------------------- |
| invalid graph at run time      | typed `TransformGraphValidationError`, nothing executes          |
| plan refusal                   | typed `TransformExecutionPlanError`, nothing executes            |
| malformed event input          | child exits non-zero -> step `typed-failure`, run stops         |
| output budget overflow         | step `typed-failure`, output NOT committed                       |
| timeout / spawn error          | step `typed-failure` with real exit/signal evidence               |
| abort before spawn             | step `cancelled`, nothing spawned                                |
| abort during run               | child killed, step `cancelled`, output NOT committed             |
| model refusal + fallback       | step `fallback-used` with the refusal detail in `detail`         |
| model refusal, no fallback     | step `typed-failure`                                            |
| artifact fabric refusal        | typed `TransformRunError`, no fabricated success                 |

## Honest evidence

- REAL: child-process spawn/read/write, exit codes, resourceUsage,
  timing, artifact revisions, structural carry-forward verification.
- FIXTURE: the model adapter lane (labeled `fixture` in code, records
  and tests). No fabricated provider numbers; cost is `null`.

## Limits (first slice, declared)

- One deterministic component (`json-event-stream-trim`); more
  components append to the store additively.
- Chain-shaped dataflow (branch/merge deferred to the TL seam).
- Memory is declared/projected, not OS-capped; timeout and output
  bytes ARE enforced for real.
- `sporta-capability` / `application-environment-action` lanes are
  deferred (worker C / TL); they plan as `capability-lane-deferred` and
  execute as typed failures.

---

# W10-A — Live-feed ingress at the REAL-local grade (P10, Worker A)

Scope law for this wave: additions live ONLY in
`packages/sporta-transforms/**`; the TL-frozen live-ingress surface in
`src/domain/liveSource.ts` (Wave 0) and every frozen contract name in
`src/contract.ts` stay byte-identical; new public names are APPENDED
(surface check stays green at 31 frozen names + additive). No external
dependency ever enters this package — the adapter uses `node:http`
built-ins only. Layer law unchanged: domain pure, app composes, all IO
in adapters.

## W10A-1 — Freeze-test extension law (P10-01)

The TL's live-ingress freeze tests are EXTENDED (never rewritten) so
every frozen name has a named, real conformance test:

- `validateLiveSourceDescriptor`: fail-closed on EVERY malformed lane
  (missing/non-string/empty `sourceId`; closed-grade violation —
  `production` and arbitrary strings refused, `real-local-live` and
  `fixture` accepted; missing/non-string/empty `contentKind`;
  non-positive/non-finite/non-number `cadenceMs`; non-positive/
  non-integer/non-number `queueBound`) — each lane returns a typed
  `LiveIngressRefusal` (`kind: "invalid-descriptor"`,
  `framesConsumed: 0`), never throws raw.
- Type-level conformance lives in `src/domain/liveSourceConformance.ts`
  (compiled by `tsc -b` via `include: ["src"]`, erased at runtime — the
  `src/contract.example.ts` precedent): well-formed
  descriptor/frame/refusal/evidence/handle records are assigned to the
  frozen types; malformed shapes are refused with `@ts-expect-error`
  (a two-sided assertion — the build fails if a shape widens OR if an
  expected error disappears).
- Runtime guards in `test/liveSourceContract.test.ts`: the closed
  vocabularies (`LiveSourceGrade`, `LiveIngressRefusalKind`,
  `LiveCloseReason`) and record field kinds are asserted on values.

## W10A-2 — `RealLocalHttpLiveSourceAdapter` (REAL lane, P10-02..04)

`src/adapters/realLocalHttpLiveSourceAdapter.ts` — the REAL local
streaming adapter implementing the frozen `LiveSourcePort`. EVIDENCE
CLASS: REAL-LOCAL — a real `node:http` server on a real ephemeral
localhost port streaming real chunked text frames at the declared
cadence to a real client socket. Honest grade: `real-local-live` —
never "production" (the closed vocabulary makes that word unutterable).

**Constructor config (wiring-time, programmer-owned):** the frame
payload list the server will stream (finite, non-empty payloads
without `\n` — one frame = one newline-delimited chunk), an injectable
clock (default `systemClockNow`), bind host (default `127.0.0.1`) and
port (default 0 = ephemeral). Impossible constructor configs throw at
wiring time (the component-store precedent); descriptor problems
refuse typed at the seam.

**Session lifecycle (`open(descriptor)`):**

1. `validateLiveSourceDescriptor` runs fail-closed BEFORE any IO — a
   malformed descriptor returns `{ refusal }` with
   `kind: "invalid-descriptor"` and nothing is opened.
2. Grade law: this adapter serves grade `real-local-live` ONLY — a
   descriptor declaring `fixture` is refused typed
   (`invalid-descriptor`) because the bytes here really do flow over
   real localhost HTTP; labeling them fixture would be a lie in the
   other direction.
3. A per-session real `node:http` server listens on the ephemeral
   port; `open` resolves only after the real client round trip (response
   headers received). Listen/connect failures return the typed refusal
   `source-unavailable` — never a raw throw.
4. The server writes frame `i` at `i * cadenceMs` as one chunk
   (`payload + "\n"`, `Transfer-Encoding: chunked`, content type from
   `descriptor.contentKind`), then ends the response after the last
   frame. The server is 1:1 with the session: close/refusal/dispose
   stops it (cadence timers cleared, sockets destroyed, `server.close()`
   awaited) — a stopped session's port refuses new connections.

**Bounded queue + back-pressure (ADR rule 16, P10-03):**

- The client parses newline-delimited frames; each complete line
  arrives into a FIFO queue bounded by `descriptor.queueBound`.
- `next()` returns the oldest queued frame (arrival ordinal as
  `LiveFrame.index`, arrival time as `receivedAt`); consumed frames
  are exactly the arrival prefix (indices are gapless while healthy).
- When a frame ARRIVES and the queue is full, the adapter REFUSES
  immediately: a typed `LiveIngressRefusal`
  (`kind: "queue-overflow"`, `framesConsumed` = frames actually
  delivered) whose detail states the honest arithmetic (arrival
  number, received / consumed / queued counts — no frame is dropped
  silently and nothing grows unboundedly); the client is destroyed,
  the server stopped, and the `LiveSessionEvidence` is finalized at
  that instant as `closeReason: "refused"` with the refusal pinned and
  `closedAt` set — the partial evidence is retained, never discarded.
  Subsequent `next()` calls return the latched refusal with
  `done: true`.
- `next()` never blocks unboundedly: every pending waiter is woken by
  a lifecycle event (frame arrival, refusal latch, clean stream end,
  consumer close, adapter dispose). A waiter can never outlive the
  session.

**Terminal semantics through the frozen shapes:** the frozen
`LiveSessionHandle.next()` can only signal "no more frames" through
`{ refusal, done: true }`. The adapter's honest mapping:

| event                                   | terminal refusal                                  | evidence state at terminal               |
| --------------------------------------- | ------------------------------------------------- | ---------------------------------------- |
| clean end-of-stream (finite list done)  | `source-unavailable`, detail says "ended cleanly" | `refusal: null`, `closeReason: "in-flight"` (awaiting the consumer's `close`) |
| queue overflow                          | `queue-overflow`                                  | finalized `refused`, refusal pinned      |
| mid-stream connection/socket error      | `source-unavailable` + error detail               | finalized `refused`, refusal pinned      |
| consumer `close()` before stream end    | `aborted` (detail carries the caller's reason)    | finalized with the caller's reason       |

The composition law for terminal disambiguation (structural, never
stringly): a terminal `next()` whose `evidence().refusal` is non-null
or whose `evidence().closeReason` is `"refused"` means the session
FAILED; a terminal with refusal null and `in-flight` state means the
stream ended cleanly and the consumer finalizes via
`close("completed")`.

**Honest cancellation (P10-04):** `close(reason)` stops the server and
client for real and finalizes the evidence with the caller's reason —
UNLESS the session already finalized by refusal (a refused session is
never re-labeled "completed" — a failed source is never successful).
`close` is idempotent (repeated calls return the same finalized
evidence). `adapter.dispose()` force-finalizes every still-open
session as `aborted` and stops every server — clean test teardown.
Post-finalization socket noise (ECONNRESET on destroyed sockets) is
expected teardown fallout of the RECORDED cause; errors that occur
while a session is live are always latched into typed
refusals/evidence — never swallowed, never thrown raw across the seam.

## W10A-3 — Live run integration (manifest pins live evidence, P10-05)

`src/app/liveIngress.ts` — `LiveTransformRunService` (new public
name) composes the live leg THROUGH the existing
`TransformRunService`: NO second execution runtime, no second ledger,
no second evidence vocabulary. The run service is injected as a
constructor dep and stays the single owner of run assembly.

`StartLiveTransformRunInput` (new name): the existing
`StartTransformRunInput` minus `inputs` (the feed is derived from the
live drain), plus the declared live source
(`{ port: LiveSourcePort, descriptor: LiveSourceDescriptor }`) and the
feed identity (`artifactRef`, `rightsSnapshot`, `provenance`) pinned
onto the run manifest's inputs.

**Flow:** validate the descriptor fail-closed (typed
`LiveIngressError` before any IO) → `open` (refusal → typed
`LiveIngressError`, no run) → drain `next()` until terminal, honoring
an injected `AbortSignal` (abort mid-drain closes the session
`aborted` and throws the typed error with the partial evidence — no
run, no fabricated feed) → terminal discrimination per the structural
law above: a failed source throws `LiveIngressError` carrying the
refused evidence (a disconnected/failed source is NEVER reported
successful); a clean end finalizes `close("completed")` → the drained
frame payloads joined as newline-delimited text become the run's input
artifact bytes, fed into `runs.runPipeline` EXACTLY like the
fixture/sample feeds → the returned record is a
`LiveTransformRunManifest` (new name, EXTENDS the frozen
`TransformRunManifest` — the frozen interface itself is untouched per
the additive-only law; the subtype is structurally assignable to it)
carrying `liveSessions: readonly LiveSessionEvidence[]` (first slice:
exactly one). The pinned evidence carries the session identity
(`descriptor.sourceId`), the honest grade verbatim
(`real-local-live`; "production" is unutterable — closed vocabulary),
frame statistics (`framesConsumed`), `openedAt`/`closedAt` and the
close reason. `semanticFidelity` stays owned by the existing run
service (the live grade never leaks into that vocabulary).

`LiveIngressError` (new name, `src/domain/errors.ts`): typed
live-ingress failure carrying the refusal and the partial
`LiveSessionEvidence` (either may be null when nothing opened).

## W10A-4 — Test law (named, REAL)

All live tests run the REAL adapter (real server socket + real client
in-process, ephemeral/temp ports, `dispose()` teardown in `finally`,
no test-only behavior switches in src) under
`pnpm exec tsx --test`:

- real server+client frame flow: declared cadence bounds, ordered
  gapless frames, honest counters, honest close evidence;
- bounded-queue overflow refusal: typed refusal + partial evidence
  retained + arithmetic honesty in the detail + server actually
  stopped (new connections refused);
- cancellation mid-stream: session finalized `aborted`, server
  stopped, terminal `aborted` thereafter;
- manifest pinning: live evidence + exact grade-label assertions
  (`real-local-live`, never "production");
- descriptor validation negative lanes: every malformed case typed
  through both the pure validator and the REAL adapter's `open`;
- live-run failure lanes: queue-overflow mid-drain and abort mid-drain
  both throw `LiveIngressError` with partial evidence and execute NO
  run.

## Failure semantics (W10-A event order)

| condition                              | outcome                                                       |
| -------------------------------------- | ------------------------------------------------------------- |
| malformed descriptor (any lane)        | typed `invalid-descriptor` refusal before any IO; no session  |
| grade outside the adapter's real lane  | typed `invalid-descriptor` refusal; no session                |
| listen/connect failure                 | typed `source-unavailable` refusal; no session                |
| queue full at frame arrival            | typed `queue-overflow` refusal; evidence finalized `refused` with partial counts |
| socket/stream error mid-stream         | typed `source-unavailable` latched; evidence finalized `refused` |
| consumer close / abort mid-stream      | server + client stopped; evidence finalized with the reason   |
| live refusal during a run's drain      | typed `LiveIngressError` with partial evidence; NO run executes |
| clean end-of-stream                    | evidence finalized `completed` on close; run executes over the drained feed |
| adapter dispose with open sessions     | sessions finalized `aborted`; all servers stopped             |

## Honest evidence (W10-A)

- REAL: `node:http` server sockets, chunked writes at the declared
  cadence, real client reads, real queue accounting, real connection
  refusals observed after server stops, real timestamps from the
  injected clock.
- FIXTURE: nothing in this lane — the adapter refuses to serve a
  `fixture`-grade descriptor. Test CONTENT (frame payloads) is
  deterministic data; every PROCESS observation is real.

## Limits (W10-A slice, declared)

- One live source per live run (mirrors the one-input chain law of
  the first slice); multi-source composition is a future additive
  extension.
- Frame payloads are newline-delimited text (one frame = one non-empty
  line); binary framing is future work.
- The server's frame list is finite and declared at wiring time; a
  continuous generator source is future work behind the same port.
- Server-side write buffering is bounded by the finite frame list;
  the client queue bound is the enforced back-pressure gate.
- HTTP/1.1 chunked transfer over localhost only — production
  CDN/ingress protocols are explicitly out of scope (ADR non-goal).
