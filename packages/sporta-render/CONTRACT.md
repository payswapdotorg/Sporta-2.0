# sporta-render CONTRACT (playback surface — W5C)

Invariants that types cannot express:

- Playback consumes ONLY render-model timelines (the adapter
  invariant holds at playback): never `SportsWorldModelRecord`, never
  any other package's surface. The port types are declared locally
  (per-package duplication law; zero `@sporta/*` dependencies).
- Playback never invents events, timestamps, entities, phrases or
  rights: a frame projects exactly what the timelines declare, and
  every derived element is a deterministic function of declared
  input (canonical order, sorted-unique refs, sequence = declared
  order).
- Frames carry the snapshot's provenance + rights-scope summaries
  forward READ-ONLY: carried verbatim, never widened, never dropped,
  deeply frozen (machine-checked).
- One playback session = one snapshot's realities: timelines with
  disagreeing carry-forward headers are refused.
- Deterministic `seek` / `step` / `play`: identical inputs plus
  identical call sequences yield identical outputs. No hidden
  wall-clock, no RNG, no ambient ordering.
- Frame projections are idempotent per `t` (`frameAt` is pure).
- Retained state is bounded: a capacity-bounded frame history, one
  playhead time, one rate and the input-sized merged event index.
  Nothing else. No unbounded accumulation of any kind.
- End-of-timeline is a normal stop (paused, `atEnd`), never an error;
  every other illegal input is a typed refusal with a machine-readable
  detail.
- The v1 reality-kind vocabulary is closed (`"tactical"` |
  `"play-by-play"`); extension is additive — a new kind is a new port
  tag + a new frame record, never a controller redesign.

## Worker-surface note (wave-5 parallel lanes)

`SPEC.md`, `CONTRACT.md`, `package.json`, `tsconfig.json`,
`src/module.ts`, `src/contract.ts` and `src/contract.example.ts` are
shared package scaffolding created in PARALLEL by w5b (render models +
realities) and w5c (playback, this file's surface) from the same base
SHA per the WO-C1 law. The TL merges both additive surfaces at
integration; w5c's code lives strictly under `src/domain/playback/` +
`test/playback*.test.ts` and w5b's under the remaining `src/` paths +
its own tests, so the merge is conflict-free by construction.

## Integration (TL-owned)

Registration in `architecture-policy.yaml`, the real workspace
dependency edges and the packages/web host wiring (the realities
surfacing inside the sporta shell behind the w4c host-conversion
surface) are TL integration steps. The playback engine is
headless-testable without any host: `pnpm exec tsx --test
packages/sporta-render/test/playback*.test.ts`.
