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

## Wave 7 — durable run journals + resume semantics (W7A, P8 persistent workers)

Spec-before-code record for the P8 "persistent workers" lane in the
execution plane. Everything is ADDITIVE: new adapters-layer files only
(`src/adapters/fsAgentRunJournal/`, `src/adapters/resumingAgentRuntime.ts`);
the frozen domain (`ports.ts`, `stateMachine.ts`, `policy.ts`,
`errors.ts`), the real `ZCodeAgentRuntimeAdapter`, the fixture adapter
and every pre-existing file stay untouched. New public names are
appended to `src/contract.ts` (surface stays additive-only). The
decorator DELEGATES to a real `AgentRuntimeExecutionPort` — sporta-work
still never implements a second runtime (invariant 2).

### Scope problem

`AgentRuntimeExecutionPort` implementations hold run state in process
memory (`ZCodeAgentRuntimeAdapter.activeRuns`). A host restart drops
every in-flight observation: events already observed are lost, and a
caller cannot distinguish "run still going" from "run never existed".
Wave 7 makes the OBSERVED run history durable and defines honest
re-attach semantics on top of the port.

### Durable run journal — `FsAgentRunJournal`

Persistence pattern source: `FsSharedSessionStore` (sporta-editors W6)
— hash-addressed per-id files, typed integrity errors, fresh-instance
durability.

- **Public layout**: one journal file per run at
  `rootDir/<sha256(runId)[0:2]>/<sha256(runId)>.jsonl`
  (default root: `<os tmpdir>/sporta-agent-run-journals`).
- **File format**: JSONL — line 1 is a header record
  `{ kind: "header", formatVersion: 1, runId, workGraphId, startedAt,
  task, organizationId, organizationVersion }`; every following line is
  an event record `{ kind: "event", event: AgentRunEvent }` in ARRIVAL
  order (the order the decorator observed them).
- **Atomic appends**: each `appendEvent` is one `fs.appendFile` of one
  complete record line — a single O_APPEND write syscall per record.
  Records never interleave mid-line and previously journaled bytes are
  never rewritten. A host crash mid-append can tear only the trailing
  record, which read-back detects and surfaces (below).
- **`openJournal(metadata)`**: appends the header when absent; an
  existing EQUAL header is an idempotent no-op (same-input retry); an
  existing DIFFERENT header is a typed `AgentRunJournalError` (header
  conflict) — a re-execution over an unresolved journal never
  silently overwrites durable history.
- **`appendEvent(runId, event)`**: the journal must be open for the
  run, the event's `runId` must match, and the event `seq` must be
  strictly greater than the last recorded seq (arrival order;
  duplicates and regressions are typed errors; GAPS ARE HONEST — the
  journal records what was observed, never invents what was not).
- **`readJournal(runId)`**: full read-back with integrity
  verification — every line must parse as its record kind with
  well-typed fields, the header's `runId` must hash back to the file's
  own address (id-address law), event seqs must be strictly
  increasing, event `runId`s must match the header. ANY corrupt
  record — including a torn tail from a crash mid-append — is a typed
  `AgentRunJournalError` carrying the path and line number: never
  silent truncation, never a fabricated event.
- **`hasJournal(runId)`**: presence check without parsing.

**Honest gaps law**: the journal records what was OBSERVED. A host
crash between process events loses nothing already journaled, and the
journal never fabricates the un-observed remainder — replay ends
honestly at the last durable event.

### Resume semantics — `ResumingAgentRuntime` (decorator)

`ResumingAgentRuntime` implements `AgentRuntimeExecutionPort` by
delegating to any inner port (the real ZCode adapter in REAL lanes;
the fixture adapter in FIXTURE-labeled tests) and journaling through
an `FsAgentRunJournal`:

- **`startRun(input)`**:
  1. delegates to the inner port — the `runId` and `startedAt` are the
     inner's own facts (the decorator never derives them);
  2. opens the journal with the handle's metadata. Same-input retries
     are no-ops (the inner is idempotent per deterministic runId, so
     the returned handle matches the journaled header). A DIFFERENT
     handle for the same journal — e.g. a re-execution after a
     restart — fails with a header-conflict `AgentRunJournalError`
     instead of overwriting the durable history.
- **`observeRun(runRef)`**:
  1. **no journal** for the run → pass-through: the inner's own
     answer, unchanged (the decorator journals exactly the runs it
     started; runs it merely finds live are observed honestly, never
     adopted retroactively — the header metadata is unrecoverable from
     a bare runId);
  2. **journal exists and its last journaled event is TERMINAL**
     (`completed`/`failed`) → replay returns the journaled list
     verbatim. The outcome was observed and journaled BEFORE the drop:
     this is recorded truth, not a fabricated completion;
  3. **journal exists, non-terminal, inner still observes the run** →
     replay first (the journaled events, byte-identical order), then
     continue: live events with seq strictly greater than the
     journaled tail are appended in arrival order; a live event
     overlapping the journaled seq range must deep-equal the journaled
     record or the decorator fails with a typed
     `AgentRunJournalError` (divergent replay — histories are never
     silently merged);
  4. **journal exists, non-terminal, inner no longer observes the run**
     (an empty live list — the run was orphaned by the restart) →
     typed `AgentRunOrphanedError` carrying the `runId`, the
     `workGraphId`, the observed event count and the LAST journaled
     event (the honest state at the crash). NEVER a fabricated
     completion.

### Failure semantics (new typed errors, adapters layer)

| Failure                                             | Typed error                                            |
| --------------------------------------------------- | ------------------------------------------------------ |
| Corrupt journal record / torn tail (any line)        | `AgentRunJournalError` (path + line + reason)          |
| Header conflict on re-open (different handle facts) | `AgentRunJournalError`                                 |
| Append without an open journal                      | `AgentRunJournalError`                                 |
| Duplicate / regressive seq append                   | `AgentRunJournalError`                                 |
| Event `runId` mismatch                             | `AgentRunJournalError`                                 |
| Divergent live-vs-journaled event (same seq)         | `AgentRunJournalError`                                 |
| Orphaned run (non-terminal journal, inner cannot observe) | `AgentRunOrphanedError` (carries last journaled state) |

### Known limitation (documented honestly)

The port does not expose run termination, and the runId is only known
after the inner returns a handle — so a re-execution attempt over an
existing journal spawns the inner process BEFORE the journal refuses
the overwrite. The spawn is wasted, the journal stays intact; hosts
should prefer `observeRun` after restarts (case 2 or 4 above).
