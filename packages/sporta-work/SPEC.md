# sporta-work — SPEC (Wave 1)

Spec-before-code record for **A1: WorkGraph + Intent**. The repository is the
source of truth; this file states behavior, the single state owner,
invariants, failure semantics and event order before the implementation.

## Scope

Intent admission (`openIntent`), WorkGraph construction, idempotent node
append, status lifecycle, the append ledger (manual-takeover provenance) and
the declared (not simulated) AgentRuntime execution seam — the Wave 2
real adapter spawns real processes, the domain beneath it stays pure.

Everything is in-memory fixture-grade. No IO, no network, no timers in
`src/domain`. Clocks are injected.

## Single state owner

`WorkGraphService` (app layer) is the only writer of WorkGraph state,
persisted through the module-internal `WorkGraphStorePort`
(`adapters/inMemoryWorkGraphStore.ts` implements it, fixture-grade). One
canonical `StoredWorkGraph` per `workGraphId`:

- `graph`: the frozen `WorkGraphRecord` shape (from `@sporta/contracts`);
- `appends`: the append ledger (`WorkAppendRecord[]`) — node appends with
  actor provenance, because the frozen `WorkGraphNode` record carries no
  actor field. The ledger is what makes manual takeover first-class
  evidence.

There is no second write path. Runs execute only through the ZCode
AgentRuntime seam (declared in `domain/ports.ts`, simulated by a fixture
adapter); this module never implements a runtime.

## IDs

- Opaque strings.
  - `workGraphId` (auto) = `wg:<fnv1a(stableStringify(intent))>` — content-derived:
    the same intent retried maps to the same graph (idempotency without an
    explicit id).
  - `nodeId` (auto) = `node:<workGraphId>:<seq>` — deterministic per graph
    state (reproducible fixtures), but NOT a retry guarantee: once a node is
    stored, a duplicate auto-id append computes the next seq and therefore a
    new node. **Append idempotency requires an explicit `nodeId`** (the
    canonical idempotency rule is per (workGraphId, nodeId)).
- Explicit `workGraphId` / `nodeId` always win and carry the idempotency
  semantics below.

## Idempotency

- `openIntent(workGraphId, intent)`:
  - existing graph + deep-equal intent → same record, no duplicate;
  - existing graph + different intent → `WorkGraphIntentConflictError`;
  - unknown id → create (status `open`, no nodes).
- `appendNode(workGraphId, nodeId, kind, parent, actor)`:
  - existing nodeId + same (kind, parent) → same node, same ledger entry,
    no duplicate, `seq` unchanged;
  - existing nodeId + different (kind, parent) → `WorkGraphNodeConflictError`;
  - unknown graph → `WorkGraphNotFoundError`;
  - unknown `parent` → `WorkGraphNodeParentError`.
- `transitionStatus(workGraphId, next)`:
  - `next` equals current status → no-op (retry-safe, record unchanged);
  - `next` is a legal successor → updated `updatedAt`;
  - otherwise → `WorkGraphStatusError`.

## `seq`

Monotonic per graph: next seq = `max(existing seqs) + 1`, starting at 1.
Idempotent retries never bump `seq` and never add ledger entries.

## Status machine

Explicit successor table (the only legal transitions):

| from          | successors                       |
| ------------- | -------------------------------- |
| open          | executing, awaiting-user         |
| executing     | awaiting-user, escalated, closed |
| awaiting-user | executing, escalated, closed     |
| escalated     | executing, closed                |
| closed        | (terminal)                       |

`open -> escalated`, `open -> closed` and any transition out of `closed` are
illegal (no skips, terminal is final).

### Append-driven triggers

Appends may drive status. The (kind, actorKind) table:

| kind            | actorKind            | trigger                                |
| --------------- | -------------------- | -------------------------------------- |
| task/run/action | agent-run            | agent-activity                         |
| task/run/action | user, editor-session | user-activity                          |
| task/run/action | arena-session        | observation (no change)                |
| artifact        | agent-run            | agent-activity                         |
| artifact        | user, editor-session | user-activity (manual edit = takeover) |
| artifact        | arena-session        | observation                            |
| evidence        | any                  | observation                            |
| outcome         | any                  | work-completed                         |

Trigger effects:

- agent-activity: open→executing, awaiting-user→executing, executing stays;
  escalated/closed → `WorkGraphStatusError`.
- user-activity: open→awaiting-user, executing→awaiting-user,
  awaiting-user stays; escalated/closed → `WorkGraphStatusError`.
- work-completed: executing/awaiting-user/escalated→closed; open →
  `WorkGraphStatusError` (nothing completed yet — a skip).
- observation: no status change; allowed on closed ONLY for `evidence`
  (post-closure evidence attachment). Every other closed-graph append →
  `WorkGraphStatusError`.

MANUAL TAKEOVER: `ActorDescriptor.actorKind === "user"` appends are the same
lineage semantics as agent appends — same parent/seq rules, same ledger
shape, plus they drive the user-activity trigger.

## AgentRuntime execution seam

`AgentRuntimeExecutionPort` (`startRun(workGraphId, organization, task) →
handle`, `observeRun(runRef) → events`) is the declared seam. Wave 2 adds
`adapters/zcodeAgentRuntime.ts`: the REAL ZCode AgentRuntime adapter that
spawns the zcode-cli binary as a real child process
(`zcode --prompt <task> --output-format stream-json`) and turns its real
lifecycle into typed events — adapter-owned monotonic `seq`, real wall-clock
timestamps from the injected clock, a terminal event whose verdict comes
from the REAL exit code, spawn-error capture (`error`), stdio drained before
the terminal event (`close`, not `exit`), and a kill-on-`dispose()` hygiene
path. `startRun` is idempotent per deterministic `runId`
(`run:<workGraphId>:<orgId>:<version>`) — a completed run is never silently
re-executed; `observeRun` of an unknown run returns `[]` (no events yet —
the seam never fabricates history).

`adapters/fixtureAgentRuntime.ts` (Wave 1) stays for tests that explicitly
label their evidence fixture-grade: it simulates deterministic run events
(`started` / `progress` / `completed` with "fixture simulation" details)
with no process at all.

## Failure semantics

Typed errors in `src/domain/errors.ts`, thrown by domain transitions and
rethrown by the app: `WorkGraphStatusError`, `WorkGraphIntentConflictError`,
`WorkGraphNodeConflictError`, `WorkGraphNodeParentError`,
`WorkGraphNotFoundError`. No error is swallowed; nothing returns a synthetic
"success" for an illegal operation.

## Event order

1. `openIntent` creates the graph (open, empty).
2. appends append-only; each append is validated (graph exists → parent
   exists → idempotency → status trigger) before any write.
3. `transitionStatus` writes only after the successor check.
4. one store `write` per created append / transition (retries write nothing).

## Honest-evidence note

All stores and the runtime adapter are in-memory fixtures. They prove
semantics (idempotency, ordering, status law), never production durability
or real agent execution.

## Wave 3 — node refs (typed cross-domain reference appends)

Spec-before-code record for the Wave 3 read-seams lane (ADR:
`docs/architecture/adr-wave3-read-seams.md`). Additive port:
`WorkGraphRefsPort` (`escalateGap`, `recordArenaResult`,
`commitArtifactRevision`), implemented by `WorkGraphService` (the single
canonical writer — unchanged).

### Shape authority

`WorkGraphNode.refs?: readonly WorkGraphNodeRef[]` (from
`@sporta/contracts`, records/readSeams.ts): `{ kind, refId }` with the
closed kind union `capability-gap | escalation | arena-result |
artifact-revision | editor-session | learning-artifact`.

### Laws

1. **Append-only immutable ledger**: refs are never removed and never
   rewritten — no API exists to do so. Appending a ref already present
   (same `kind` + `refId`) is an idempotent no-op (no write, `updatedAt`
   unchanged). Ref order is append order.
2. **Produced kinds only**: this module appends exactly `capability-gap`,
   `escalation`, `arena-result`, `artifact-revision` — structurally, via
   the three typed methods (no generic ref-append surface).
   `editor-session` / `learning-artifact` refs are other lanes' outputs:
   consumed read-only here, never produced.
3. **v1 validity**: nodes without refs (all Wave 1/2 graphs) stay valid;
   the `refs` array is created lazily at the first append and never
   fabricated by reads.
4. **No input-shape drift**: existing public inputs (`OpenIntentInput`,
   `AppendWorkNodeInput`, …) keep their shapes — refs enter only through
   the three new typed inputs. (A generic optional `refs` field on
   `AppendWorkNodeInput` was rejected: it would allow producing kinds this
   lane must not produce.)

### Transitions (status edges the service already owns)

- `escalateGap(workGraphId, nodeId, gapId, escalationId)`:
  1. graph must exist → `WorkGraphNotFoundError`;
  2. status edge `executing|awaiting-user -> escalated` via the frozen
     successor table (`open -> escalated` and `closed -> escalated` throw
     `WorkGraphStatusError` — no skips, terminal stays terminal);
  3. appends `capability-gap` (gapId) + `escalation` (escalationId) refs
     to the owning node → `WorkGraphNodeNotFoundError` when missing;
  4. ONE store write after both steps succeed (illegal edges leave no
     partial refs).
- `recordArenaResult(workGraphId, nodeId, resultId)`:
  1. appends the `arena-result` ref to the owning node;
  2. when status is `escalated`, resolves the arena frontier
     `escalated -> executing` (the resolution edge); on any other status
     the ref is appended with NO status change (e.g. a result landing
     after closure — cross-domain facts stay recordable);
  3. idempotent per input.
- `commitArtifactRevision(workGraphId, nodeId, revisionId)`:
  1. the node must exist AND be kind `artifact` → typed refusals
     (`WorkGraphNodeNotFoundError`, `WorkGraphNodeKindError`);
  2. appends the `artifact-revision` ref; NO status change (revision
     commits are not graph status transitions — the artifact fabric owns
     revision truth, the graph references it);
  3. idempotent per input.

### Refs vs the closed-graph law

The closed-graph law governs NODE appends (only `evidence`). Ref appends
are a different ledger: they record cross-domain facts (a revision was
committed in the artifact fabric, an Arena result was validated) and
remain appendable to nodes of closed graphs — the immutable ref ledger
records history; it never rewrites it. Documented decision, not an
oversight.

### Failure semantics (new typed errors)

`WorkGraphNodeNotFoundError`, `WorkGraphNodeKindError`,
`WorkGraphNodeRefError` (unknown kind or empty refId — runtime guard for
callers that bypass types). Thrown by domain transitions, rethrown by the
app; no partial writes, no silent fallbacks.
