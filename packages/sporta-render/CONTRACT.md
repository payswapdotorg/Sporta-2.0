# sporta-render

The renderer adapter boundary and the two materially different sports
production realities (tactical board + play-by-play), both projected
from the SAME `SportsWorldModelRecord` snapshot. Created by Worker B
through the WO-C1 module-creation law (Wave 5, ADR decision 2 + 5);
registered in architecture-policy.yaml + wired with a real workspace
dependency edge by the TL at integration.

Invariants that types cannot express:

- The SWM invariant is absolute: RENDERERS never consume
  `SportsWorldModelRecord` directly. The only code that touches the
  snapshot type is the two pure adapter functions
  (`tacticalRenderModel`, `playByPlayRenderModel`) and the app-layer
  composition over them; serializers and downstream consumers see
  render models ONLY. A test machine-checks this by scanning the
  serializer source for `@sporta/contracts` imports and
  `SportsWorldModelRecord` tokens (none may appear).
- Zero invented facts: every element of a render model is copied
  verbatim from the snapshot (provenance, rights-scope content,
  uncertainty evidence) or deterministically derived and labeled
  (sequence = index in `snapshot.events`; board coordinates =
  `derived-layout` renderer geometry; phrase text = rule output over
  record fields). Every derived element carries the source
  event/observation id it derives from; every phrase carries
  `anchoredEventId` + `derivedFields`.
- Timestamp honesty: the frozen v1 record carries no per-event
  wall-clock; both realities carry exactly ONE capture anchor copied
  from `snapshot.provenance.capturedAt`, explicitly labeled
  `capturedAtSource: "snapshot-provenance"`. The play-by-play text
  states the limitation itself. Sequence (the record's own event
  order, duplicates as-given) is the only per-event ordering fact.
- Read-only carry-forward (decision 5): render models are DEEPLY
  FROZEN at construction (`Object.isFrozen` holds recursively for
  every produced object/array). Renderers never widen rights: the
  models carry `rightsScope` as a verbatim copy of
  `PolicySet.rights`; the fail-closed `swmRenderableUnder` gate
  mirrors `artifactVisibleToUsage` (at least one declared usage
  permitted AND none prohibited; absent/empty usage never passes).
  The C6 usage-context vocabulary is consumed, never invented —
  `RenderUsageContext` is per-package duplication of the ratified
  W3-B/W4-B pattern (no new shared contracts type).
- Determinism: adapters, the phrasing engine, the transcript join and
  the SVG serializer are pure functions of their inputs — no clock,
  no randomness, no ambient state; identical inputs yield
  byte-identical outputs (asserted by tests on the model JSON and the
  SVG string).
- Confidence validation is fail-closed: every confidence consumed
  (`snapshot.uncertainty[].confidence`, `snapshot.provenance.confidence`)
  must lie in [0, 1] or the adapter throws a typed `RenderInputError`
  (the world module's `isValidConfidence` law, mirrored). The
  confidence attach rule never invents: a `confidence` field appears
  on a board entity / timeline event / narrative record ONLY when some
  uncertainty entry has `subject === id` (first match wins).
- The phrasing engine is RULE-BASED and DOMAIN-AGNOSTIC — three fixed
  ordered templates (`event-sequence`, `event-anchor`,
  `event-confidence`) over generic vocabulary. NO ML claims: no model
  is loaded or executed, nothing is learned; a new sport or non-sport
  event domain renders unchanged (domain extension law).
- `serializeTacticalSvg` is hand-written string building: no DOM, no
  XML library, no IO. The reality is the RENDER MODEL + serializer —
  honest about NOT being pixels: no rasterization or browser-execution
  is claimed or performed. All interpolated text is XML-escaped;
  marker/tick counts equal the model's entity/event counts; the
  document carries provenance + rights inside `<title>`/`<desc>`.
- The serializer's canvas adds a renderer-owned timeline strip
  (120 units) below the 1000x640 board box: scaffolding geometry, not
  a world fact (documented so nobody reads the strip height as a
  measured dimension).
- `RealityProjectionService.project` is the ungated pure composition
  (a data projection exercises no usage; hosts gate at the surfacing
  boundary — the artifact plane's plumbing/gated-seam split);
  `projectGated` is the fail-closed variant (typed
  `RenderRightsRefusalError`).
- `package.json` declares ZERO dependencies by work-order instruction:
  the consumed `@sporta/contracts/contract` surface is type-only
  (erased at runtime under `verbatimModuleSyntax`). Integration (TL):
  append `sporta-render` to architecture-policy.yaml (roots
  `packages/sporta-render/src`, `managed: true`,
  `requires: [sporta-contracts]`,
  `publicEntrypoints: [packages/sporta-render/src/contract.ts]`,
  layers domain/app/adapters, owner worker-b), add the
  `"@sporta/contracts": "workspace:*"` dependency edge to
  `packages/sporta-render/package.json`, run a real `pnpm install`
  (the WO-C1 `node_modules/@sporta/contracts` symlink used during
  worker development is local-only and gitignored), then re-run all
  gates. During worker development the package is resolvable ONLY
  through that gitignored symlink.
- No record in this module carries a timestamp of its own; the only
  wall-clock facts are the snapshot's captured-at anchors copied
  verbatim (there is no clock to inject).
