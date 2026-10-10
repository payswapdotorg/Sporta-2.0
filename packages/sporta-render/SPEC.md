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
