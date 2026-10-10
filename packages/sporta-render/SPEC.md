# sporta-render SPEC (Wave 5, work-order W5B — ADR wave-5 decision 2 + 5)

Scope: the renderer adapter boundary (the SWM invariant "renderers consume
SWM through adapters, never directly") and TWO materially different
realities — the tactical board reality and the play-by-play reality — both
derived from the SAME `SportsWorldModelRecord` snapshot through per-reality
pure adapters. This module is created by Worker B through the WO-C1
module-creation law and is NOT registered in architecture-policy.yaml —
the TL registers it at integration (registration, root manifests, the
lockfile and the real `@sporta/contracts` workspace edge are TL-owned).
During worker development the package is kept resolvable through the WO-C1
transitional law: a gitignored
`packages/sporta-render/node_modules/@sporta/contracts` symlink.

`package.json` declares ZERO dependencies (the consumed
`@sporta/contracts/contract` surface is type-only — erased at runtime by
`verbatimModuleSyntax`). The future real workspace edge is a TL
integration step (see CONTRACT.md, "Integration").

## Input law (read-only consumption)

The ONLY input type this module consumes is `SportsWorldModelRecord`
(`@sporta/contracts/contract`), consumed READ-ONLY:

- No type in `@sporta/contracts` is edited, extended or re-exported as a
  value; this package never mutates a snapshot (tests freeze inputs
  and prove non-mutation).
- Everything the render models carry is either COPIED verbatim from the
  snapshot (provenance, rights-scope content, uncertainty evidence) or
  DETERMINISTICALLY DERIVED and labeled as derived (sequence indexes,
  board layout coordinates, phrase text). Zero invented facts: every
  derived element carries the source event/observation id it derives
  from.

## Timestamp honesty law

The frozen v1 `SportsWorldModelRecord` carries events as opaque ids with
NO per-event wall-clock timestamps; the single wall-clock fact a snapshot
asserts is `provenance.capturedAt` (the capture anchor of the authorized
source). Therefore:

- Each render model carries ONE capture anchor (`capturedAt`, copied from
  `snapshot.provenance.capturedAt`) labeled
  `capturedAtSource: "snapshot-provenance"`.
- Per-event records carry the SAME anchor with the SAME explicit source
  label — never presented as a per-event measurement. The play-by-play
  phrase engine states this limitation in the generated text itself
  ("per-event timestamps are not carried by the world model").
- Sequence is the honest per-event ordering fact: the index of the event
  id in `snapshot.events` (the record's own order; duplicates and order
  are carried as-given — the adapter never re-sorts or deduplicates).

## Adapter boundary (W5B-2)

Per-reality adapters are PURE projection functions
`SportsWorldModelRecord -> <RealityKind>RenderModel`:

- `tacticalRenderModel(snapshot) -> TacticalRenderModel`
- `playByPlayRenderModel(snapshot) -> PlayByPlayRenderModel`

Shared carry-forward (read-only, identical bytes in both realities —
decision 5 of the ADR): `source` (swmId/snapshotHash/domain),
`provenance` (verbatim `ProvenanceDescriptor`), `rightsScope` (verbatim
holders/usages/prohibitions copy of `PolicySet.rights` — renderers never
widen rights), `evidence` (verbatim `{ observationId, confidence }` list
from `snapshot.uncertainty`). Render models are DEEPLY FROZEN at
construction: the read-only law is machine-checked at runtime, not only
typed. Consumers build new records; they never mutate a render model.

Confidence attach rule (applies to both realities): a board entity or
timeline event carries `confidence` ONLY IF some
`snapshot.uncertainty` entry has `subject === id` (first match wins,
deterministic); otherwise the field is absent — never invented.

Validation (fail-closed, typed): every confidence this module consumes
(`uncertainty[].confidence` and `provenance.confidence`) must lie in
[0, 1] as the `Confidence` primitive documents; a violation is a typed
`RenderInputError` (the world module's `isValidConfidence` law,
mirrored). Empty `entities`/`events` are honest empties, never errors.

## Tactical board reality (W5B-3)

`TacticalRenderModel` — the structured board record — is spatial /
structural:

- `board`: renderer-owned geometry constants
  (`TACTICAL_BOARD_WIDTH` = 1000, `TACTICAL_BOARD_HEIGHT` = 640, margin 40) + `coordinateSystem: "derived-layout"` + one record per entity
  (`entityId`, derived layout `x`/`y`, optional attached confidence).
- Derived layout (deterministic, documented as RENDERER-OWNED geometry,
  never a claim about real-world positions): entities are placed on a
  near-square grid derived from their index in `snapshot.entities` —
  columns = ceil(sqrt(total)); row/column from the index; coordinates
  interpolated inside the margin box; a sole entity is centered. The
  same index and total always yield the same coordinates.
- `timeline`: the capture anchor + one record per event (`eventId`,
  `sequence`, `capturedAt` + `capturedAtSource`, optional attached
  confidence), in the record's own event order.

`serializeTacticalSvg(model) -> string` (adapters layer): a
deterministic SVG 1.1 document serializer, hand-written string building
ONLY (no DOM, no XML library, no external state — runs in plain node).
Honesty: the reality is the RENDER MODEL + serializer — the serializer
emits a data-class SVG document and is honest about NOT being pixels
(no rasterization claim, no browser-execution claim). Laws:

- Deterministic: fixed element/attribute order, coordinates formatted
  through one rounding rule (2 decimals), byte-identical output for
  identical models.
- Faithful: every marker and label in the document comes from the model
  (entity count = circle marker count; event count = timeline tick
  count); all interpolated text is XML-escaped (`& < > " '`).
- Carries provenance + rights forward INSIDE the document (`<title>` =
  the snapshot reference, `<desc>` = provenance + rights summary).
- Canvas = board box + a renderer-owned timeline strip
  (`TACTICAL_TIMELINE_STRIP_HEIGHT` = 120): the strip is scaffolding
  geometry, not a world fact.

## Play-by-play reality (W5B-4)

`PlayByPlayRenderModel` — the textual / sequential narrative projection:

- `records`: one record per event, ordered by sequence (the record's own
  event order): `eventId`, `sequence`, `capturedAt` +
  `capturedAtSource`, optional attached confidence, and `phrases`.
- Every phrase carries `text`, `templateId` (which rule produced it),
  `anchoredEventId` (the event id the phrase derives from — every phrase
  is traceable to an event id) and `derivedFields` (the snapshot fields
  the text was built from).

The phrasing engine (domain layer) is RULE-BASED and DOMAIN-AGNOSTIC:
a fixed ordered rule set over record-derived facts, NO ML claims (no
model is loaded or executed; no learning; nothing statistical beyond
deterministic field copies). The vocabulary is deliberately generic
(event, sequence, domain, capture time, confidence) — no sport-specific
terms, so a new sport or non-sport event domain renders unchanged
(domain extension law). Rules (evaluated in order, all pure):

1. `event-sequence` (always):

   ```text
   Event <id> recorded at sequence <n> of <total> in domain <domain>.
   ```

2. `event-anchor` (always):

   ```text
   Event <id> is anchored to the snapshot capture time <capturedAt>
   (snapshot provenance; per-event timestamps are not carried by the
   world model).
   ```

3. `event-confidence` (only when the confidence attach rule fired):

   ```text
   Event <id> carries recorded confidence <confidence>.
   ```

`playByPlayTranscript(model) -> string`: deterministic transcript join
(one line per record: the record's phrases joined by a single space) —
a convenience read over the model, never a second source of truth.

## Usage gate (C6 law, consumed — never invented)

`RenderUsageContext` (per-package duplication of the ratified W3-B /
W4-B usage-context pattern; no new shared contracts type) +
`swmRenderableUnder(rights, usage)`: fail-closed invariant-22 gate
mirroring `artifactVisibleToUsage` — a snapshot is renderable iff at
least one declared usage is affirmatively permitted by
`PolicySet.rights.usages` AND none is prohibited; absent/empty usage is
NEVER renderable. The C6 vocabulary (`RightsScope.usages` /
`prohibitions`) is consumed verbatim, never extended.

## App composition (reality projection)

`RealityProjectionService` — the A13 harness and the seam future
playback/product hosts compose:

- `project(snapshot)`: runs BOTH adapters over the SAME snapshot and
  returns `{ tactical, playByPlay }` (the two-realities materiality
  proof surface).
- `projectGated(snapshot, usage)`: the same projection behind the
  fail-closed usage gate — a typed `RenderRightsRefusalError` when the
  snapshot's rights do not affirmatively permit a declared usage.

The ungated `project` is the pure read-model composition (producing a
data projection exercises no usage; hosts gate at the surfacing
boundary exactly like the artifact plane's v1 plumbing/gated-seam
split). Renderers never widen rights: the models carry `rightsScope`
read-only so every downstream plane re-checks.

## Materiality (A13) invariant

An invariant test asserts the two render models share the SAME snapshot
input (identical shared header bytes) yet produce STRUCTURALLY DISJOINT
projections: the reality-specific key paths of the tactical body
(`board.*`, `timeline.*` — spatial/structural) and the play-by-play
body (`records.*` — textual/sequential) share no key path, and neither
body contains the other reality's characteristic fields.

## Layering, sizing, and what this module is NOT

- Layers follow the module convention: `domain` (pure projections,
  rules, geometry), `app` (the reality-projection composition),
  `adapters` (the external-document serializer — the
  `kdenliveXml.ts` precedent: external format serialization lives in
  adapters). The single public entrypoint is `src/contract.ts`.
- File-size law: no source file > 400 lines.
- NOT claimed: pixels/rasterization (the serializer emits an SVG
  document string), ML/perception (rule-based transforms only),
  per-event semantics beyond the record's own ids/order/anchor, any
  mutation of SWM (external tools may propose observations but never
  silently mutate canonical SWM — this module only READS).

---

<!-- TL union: the W5C playback SPEC sections follow (merged from the parallel lane) -->

# sporta-render SPEC (Wave 5, work-order W5C — ADR wave-5 decisions 3 + 5: the playback engine)

Status: SPEC — written before implementation.

## Scope

The playback engine over renderer render-model timelines: deterministic
time-sequenced event replay producing per-tick frames for each declared
reality kind (tactical board delta; play-by-play narrative segments),
with deterministic `seek` / `step` / `play` semantics over bounded
buffers and typed playback errors (ADR wave-5, decision 3). The frames
carry the render models' provenance + rights-scope summaries forward
read-only (decision 5).

This surface is created by Worker C through the WO-C1 module-creation
law and lives strictly under `src/domain/playback/` (+ `test/` + the
package scaffolding files). Worker B (w5b) builds the render-model
surface of the SAME package in parallel (`src/domain/renderModel.ts`,
`src/domain/tactical.ts`, `src/domain/playByPlay.ts`, ...) from the
same base SHA; the TL merges both additive surfaces at integration.
This SPEC describes ONLY the playback surface (w5b's SPEC describes
the render-model surface).

`package.json` declares ZERO dependencies: the playback port
declarations duplicate the render-model timeline SHAPE locally (the
accepted per-package duplication cost — the same law as wave 4). The
integration-time composition (TL work) wires the real render models
into this port.

## Input law (the adapter invariant holds at playback)

Playback consumes ONLY render-model timelines through the typed port
declared in this package (`RenderTimelinePort`, `src/domain/playback/ports.ts`):

- A port carries: a reality-kind tag (`"tactical" | "play-by-play"`),
  the timeline's events (ids + timestamps + optional durations +
  payload refs) and the read-only carry-forward header (source
  summary, provenance summary, rights-scope summary) — the shape
  render models expose.
- Playback NEVER consumes `SportsWorldModelRecord` — renderers consume
  the SWM through adapters, and playback sits ABOVE the render models,
  consuming only their timelines (the SWM invariant holds at playback
  too). A source-scan test machine-checks this law (no `@sporta/`
  import specifier appears anywhere under `src/`).
- One playback session = ONE snapshot's realities: every timeline in a
  session must declare structurally equal source/provenance/rightsScope
  summaries (typed refusal otherwise). Playback never merges and never
  widens: the summaries are carried verbatim into every frame.
- The port's `atMs` is milliseconds-since-anchor AS DECLARED by the
  timeline. How a given render model derives timestamps is the
  composition adapter's concern (the v1 render models expose the
  record's own event order + the snapshot capture anchor; a
  deterministic sequence-to-tick mapping is the documented default
  derivation for that wiring). The playback engine never invents a
  timestamp: it only orders what the port declares.

## Time model

- The timeline anchor is t = 0. For a declared event `e`:
  `atMs(e) >= 0` (finite); `durationMs(e) = e.durationMs ??
defaultEventDurationMs` (finite, > 0).
- Tick grid: `tickMs` (default 1000 ms). Tick `t` covers the
  half-open interval `[t * tickMs, (t + 1) * tickMs)`.
- An event is ACTIVE at tick `t` iff its half-open interval
  `[atMs, atMs + durationMs)` intersects the tick interval:
  `atMs < (t + 1) * tickMs AND atMs + durationMs > t * tickMs`.
- Timeline duration = `max(atMs + durationMs)` over all declared
  events; `totalTicks = ceil(durationMs / tickMs)`; valid ticks are
  `0 .. totalTicks - 1`. The destination tick of a time `T` is
  `min(floor(T / tickMs), totalTicks - 1)`.
- Per-tick output NEVER invents events: a frame carries exactly the
  active events the timelines declare (kind-tagged, canonical order:
  `atMs`, then kind declaration order, then `eventId`), plus the
  per-reality projections of those events and the verbatim
  carry-forward header.

## Controller semantics (`PlaybackController`)

Constructed from one or more kind-tagged timelines + options
(`tickMs` default 1000; `frameBufferCapacity` default 64;
`defaultEventDurationMs` default = `tickMs`). The playhead starts at
t = 0 and the opening frame (tick 0) is emitted into the bounded
buffer at construction.

- `frameAt(timeMs)` — PURE projection of the frame at the destination
  tick of `timeMs`. Idempotent per `t`: it never moves the playhead,
  never writes the buffer and returns a deeply frozen frame; repeated
  calls return deep-equal frames. It validates the same range as
  `seek` (`0 <= timeMs <= durationMs`).
- `seek(timeMs)` — validates `0 <= timeMs <= durationMs` (typed
  `OutOfRangeSeekError` otherwise, naming the value and the valid
  range), moves the playhead to `timeMs`, emits the destination
  frame into the bounded buffer and returns it.
- `step(deltaTicks)` — moves the playhead by whole ticks (negative =
  rewind; tick-quantized: the playhead snaps to the tick grid). The
  destination must lie in `0 .. totalTicks - 1` (typed
  `OutOfRangeStepError` otherwise, naming delta and bounds). Emits
  and returns the destination frame.
- `play(rate)` — sets the playback rate (finite, > 0; typed
  `InvalidRateError` otherwise). `pause()` clears it. `advance` while
  paused is a typed `PlaybackPausedError` (a typed refusal, not a
  silent no-op).
- `advance(dtMs)` — requires playing; `dtMs` must be finite and
  `>= 0` (typed `InvalidAdvanceError` otherwise). Target time =
  `playheadMs + dtMs * rate`, clamped to the timeline duration.
  Emits ONE frame per tick CROSSED (the starting tick is not
  re-emitted; ticks are visited in order), each into the bounded
  buffer; returns the emitted frames as a caller-owned transient.
  Sub-tick advances accumulate in the playhead (slow motion works:
  rate 0.5 x two 1000 ms advances cross one tick). When the clamp
  engages the playhead rests at the duration, playback stops (paused,
  `atEnd` true) — end-of-timeline is a normal stop, never an error.
- `recentFrames()` — a frozen copy of the retained frame buffer
  (oldest -> newest), capacity-bounded.
- `state` — a frozen snapshot: `playheadMs`, `cursorTick`, `tickMs`,
  `rate`, `playing`, `atEnd`, `totalTicks`, `durationMs`, the
  declared kinds, `frameBufferCapacity`, `defaultEventDurationMs`.

Determinism: the controller is a deterministic state machine — the
same constructor arguments plus the same call sequence yield
byte-identical outputs. No wall-clock, no RNG, no hidden ordering:
time is always a declarative argument.

## Per-tick reality frames (`frameAt` projections)

For each declared reality kind, the tick's active events project to:

- tactical -> `TacticalRealityFrame`: a BOARD DELTA — the
  sorted-unique payload refs of the active tactical events
  (`affectedEntities`) plus the sorted-unique active tactical event
  ids. Playback never derives geometry: positions are the tactical
  render model's concern; the delta carries only declared ids/refs.
- play-by-play -> `PlayByPlayRealityFrame`: NARRATIVE SEGMENTS — one
  segment per active play-by-play event, each carrying the event id,
  its `sequence` (the timeline's own declared order — the record's
  own order law) and its sorted-unique payload refs. Playback never
  phrases narrative: phrasing is the play-by-play render model's
  concern; segments are the anchors the narrative hangs on.

Every frame (all kinds) carries the read-only carry-forward header
(source + provenance + rights-scope summaries) verbatim from the
timelines. Frames and their nested records are deeply frozen — the
read-only law is machine-checked, not only typed.

## Buffer laws (bounded memory)

1. Retained frame history is capacity-bounded: at most
   `frameBufferCapacity` frames (default 64; FIFO eviction, oldest
   first). `recentFrames()` returns a frozen copy — callers cannot
   grow controller state.
2. Frames returned by `advance` are caller-owned transients; the
   controller retains only the capacity-bounded tail. A caller
   advancing the whole duration in one call owns that whole array —
   batch projection is a caller choice, never controller
   accumulation.
3. The merged event index is built ONCE at construction and is
   O(declared events) — input-sized, never grown by playback. The
   controller's entire retained state is: one playhead time, one
   rate, the capacity-bounded frame buffer and the input-sized index.
   No hidden logs, no playhead history, no frame memoization (which
   would be an unbounded cache).

Compute law (documented alongside the memory law): a per-tick
projection scans the merged index prefix whose `atMs` precedes the
tick end (binary-searched start) and allocates only the active-event
window — O(declared events) worst case per tick, memory O(active
events).

## Failure semantics

| Failure                                                                                                                                                              | Typed error                   |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| No timelines at all, or a timeline with zero events                                                                                                                  | `EmptyTimelineError`          |
| Malformed event (empty id; non-finite/negative `atMs`; non-finite/non-positive `durationMs`; non-string/empty payload refs; duplicate `eventId` within one timeline) | `MalformedTimelineEventError` |
| Malformed carry-forward header (missing/empty fields; confidence outside [0, 1])                                                                                     | `MalformedCarryForwardError`  |
| Timeline kind outside the v1 vocabulary                                                                                                                              | `UnknownRealityKindError`     |
| The same reality kind declared by two timelines                                                                                                                      | `DuplicateRealityKindError`   |
| Carry-forward headers disagree across timelines                                                                                                                      | `TimelineCarryMismatchError`  |
| Invalid options (`tickMs`, `frameBufferCapacity`, `defaultEventDurationMs`)                                                                                          | `InvalidPlaybackOptionsError` |
| `seek`/`frameAt` outside `[0, durationMs]`                                                                                                                           | `OutOfRangeSeekError`         |
| `step` destination outside the tick range                                                                                                                            | `OutOfRangeStepError`         |
| `play(rate)` with rate not finite > 0                                                                                                                                | `InvalidRateError`            |
| `step` with a non-integer / non-finite delta                                                                                                                         | `InvalidStepError`            |
| `advance` while paused                                                                                                                                               | `PlaybackPausedError`         |
| `advance` with non-finite or negative `dtMs`                                                                                                                         | `InvalidAdvanceError`         |

All errors extend `PlaybackError` with a machine-readable `detail`
prefix. Validation precedes mutation: a refused construction or call
leaves no trace.

## Honest evidence

Pure functions run for real in the headless tests (node:test + tsx —
the repo law): deterministic outputs on real inputs, real wall-time
measured by the runner. Timeline fixtures are labeled fixture-grade
in the test headers. No wall-clock dependency exists inside the
engine (all times are declarative arguments). The packages/web host
wiring is TL integration work — this surface delivers the engine +
tests + honest examples only.

## Single state owner

`PlaybackController` (`src/domain/playback/controller.ts`) solely
owns the playhead, the rate and the bounded frame buffer for a
session. There is no other write path into playback state; frames
and ports are read-only by construction (deep freeze).
