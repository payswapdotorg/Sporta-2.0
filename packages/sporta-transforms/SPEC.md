# sporta-transforms — SPEC (P9 Wave 9, Worker A)

Spec-before-code record for **W9A-1..W9A-4**: typed DAG validation,
graph resolution into a bounded execution plan, the REAL deterministic
node execution lane, the provider-neutral model adapter lane, and the
transform-run manifest. Authority order:
`docs/work-orders/transform-marketplace-work-orders.md` ->
`docs/architecture/adr-transform-studio-marketplace-and-application-environments.md` ->
`docs/contracts/transform-marketplace.md` ->
`docs/testing/transform-marketplace-acceptance.md` (P9-01..P9-06).

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
