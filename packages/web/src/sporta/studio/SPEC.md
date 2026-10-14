# Transform Studio SPEC (W9C-8 → W11B)

The studio surface SPEC. Waves append sections; earlier sections stay as
written (history, not live truth) — the newest wave's section states the
current presentation law.

## Wave 9C-8 — the studio surface (historical)

The P9 studio: pipeline graph building + validation, marketplace/review
status, feed-launch pipeline selection, attached-app permission disclosure.
Pure view-model modules (`graphStudio.ts`, `marketplaceViews.ts`,
`launchSelection.ts`, `appAttachmentViews.ts`, `samplePreview.ts`) are the
tested seam; the render surface is build-verified, honestly labeled.

## Wave 10A — the composition seam (historical)

`studioComposition.ts` (headless, REAL legs, outside this lane) +
`studioBrowserFixture.ts` (labeled FIXTURE browser host) implement
`TransformStudioHostPort`. The tab-only presentation
(`TransformStudio.tsx` + 4 tabs) was the W9C render surface.

---

## Wave 11B — the Studio as a feed-to-output workbench (CURRENT)

Worker: w11b. Work order: docs/work-orders/sporta-native-ui-work-orders.md
("Worker B — Studio and feed-to-output workbench"). Architecture:
docs/architecture/adr-sporta-native-product-ui.md (binding UI requirement 5)
+ docs/architecture/sporta-product-ui.md ("Studio" section). Screen-port law:
packages/web/src/sporta/product/SCREEN-PORTS.md (the studio row).

### W11B-0 — the gap

The W9C presentation is a narrow (max-width 860px), tab-only implementation
panel: four disconnected tabs (Graph / Marketplace / Feed launch / Apps), no
source/feed context, no preview-to-run continuity, no main work area. The ADR
requires a purposeful media workflow: choose prerecorded/live source,
discover/select an approved pipeline, inspect/edit the transform graph,
preview the transformation and its events, configure a run, monitor honest
progress, inspect resulting artifacts — with the wide screen using space for
preview, event/timeline context, graph editing and result inspection.

### W11B-1 — the workbench layout (desktop-first, mobile-safe)

The studio renders as a WORKBENCH, not a tab column:

- **Desktop (1440x900 acceptance viewport)** — a three-region grid reading
  left-to-right through the product flow:
  1. **Source rail (left)** — evidence badges (host grade + screen evidence
     grade), the stage progress rail (Source → Pipeline → Preview → Launch →
     Status/output; done/current/locked with honest reasons), the feed/source
     selection (recorded feed + live sources with W10 evidence), and the
     cross-screen links (Worker C's marketplace / connected-apps / runs /
     library destinations).
  2. **Main work area (center, the widest region)** — the pipeline picker
     (published listings selectable; suspended listings honestly visible and
     marked not-selectable) ABOVE the graph work area (node drafting with a
     declared component-digest input, edge drafting, validation through the
     REAL validation port, typed per-violation display). The graph is the
     primary surface — never a narrow tab.
  3. **Context panel (right)** — the stage-appropriate context: sample
     preview + review status (Preview stage), the launch disclosure +
     confirmation gate + admission result (Launch stage), the status/output
     summary (Status stage), plus the concise marketplace and attached-apps
     summaries.
- **Mobile (390x844 acceptance viewport)** — single column stacked in flow
  order (badges → source → pipeline → graph → preview → launch → status →
  summaries). Core actions stay reachable in the stack; NO horizontal page
  overflow (fluid widths, `min-width: 0` grid children, `overflow-wrap` on
  digests, wrapped chip rows).
- **Theme tokens** — every visual token is Sporta-owned: the frozen
  `--sporta-*` namespace (Worker A's `SportaThemeTokens`), consumed with
  self-consistent fallbacks so the studio renders coherently before Worker
  A's sheet is wired and inherits the tokens when present. No ZCode theme
  classes, no ZCode vocabulary.
- **Keyboard + semantics** — every interactive element is a real button/input
  with visible focus (`:focus-visible`), stage rail is a `<nav>` of buttons
  with `aria-current`, panels are labelled sections, async results use
  `role="status"` / `role="alert"`, digest text wraps. Loading, error and
  empty states exist for EVERY async seam (listings, review, preview,
  disclosure, admission, attachments, live evidence, validation).

### W11B-2 — one coherent workflow through the EXISTING real seams (state-owner law)

The workbench composes the SAME reads/writes the W9C tabs used — no second
authority, no new state owner:

1. **Source selection** — recorded feed (the composed sample seam) or live
   source (W10 lanes). Live evidence displays VERBATIM through the new pure
   `liveSourceViews.ts`: the exact grade string `real-local-live` (never
   "production" — the closed vocabulary), session evidence (sourceId, frames
   consumed, opened/closed, close reason) and typed refusals (kind + detail +
   frames consumed) exactly as the seams return them.
2. **Pipeline selection** — `host.listListings()`; the honest filter keeps
   SUSPENDED listings visible and explicitly not-selectable (the W10A test
   law: the suspended seed stays honestly SUSPENDED, never hidden).
3. **Graph editing + validation** — `host.validateGraph(draft)`; the typed
   per-violation records surface VERBATIM (kind + detail), never stringly,
   never swallowed; per-kind count chips are display-only.
4. **Preview + review context** — `host.readSamplePreview` +
   `host.readReviewStatus` (measured evidence at the point of use; honest
   null when a pipeline declares no sample).
5. **Run confirmation + disclosure** — `host.readLaunchDisclosure` (the full
   P9-12 disclosure: publisher, version, digest, terms/price/license, rights,
   dependencies, outputs, limitations, expectations + grade, legal notice)
   and the EXISTING `launchSelection.ts` machine (disclosure → explicit
   confirmation → admission). `host.selectForLaunch`'s typed result surfaces
   VERBATIM — admitted pins the approved digest + entitlement; every refusal
   keeps its frozen reason + detail; NEVER softened, never a second ladder.
6. **Status/output** — the admission result + the preview run's measured
   evidence + links to Worker C's runs/library screens (through the shell
   port; see W11B-3).
7. **Legacy Marketplace/Apps TABS reworked** — the four-tab presentation is
   REPLACED by the flow above; marketplace and attached-apps become concise
   summaries + links pointing at Worker C's first-class `marketplace` and
   `connected-apps` screens. No parallel marketplace/app state: the summaries
   read the SAME `listListings`/`listAppAttachments` data already loaded for
   the flow.

### W11B-3 — shell registration + cross-screen links (Worker A contract)

`studioRegistration.ts` (pure) registers the studio as the `studio` screen
through the TL-FROZEN `SportaScreenRegistration` type and declares the
cross-screen link routes as `SportaScreenRoute` values validated fail-closed
by `validateSportaScreenRoute` (screens never guess ids).

The root accepts an OPTIONAL `shell?: SportaProductShellPort` prop. When
wired, links navigate through `shell.navigate()` and a typed
`SportaNavigationRefusal` renders as a refusal (verbatim, never silent).
At the w11b base SHA (f1192a6) Worker A's shell component is NOT present —
only the frozen contract module is — so the studio consumes the CONTRACT
TYPES + validation only and renders links in an honest disabled-with-reason
state when no shell is injected. Recorded in NEXT DEPENDENCIES (Worker A/TL
integration injects the shell; the TL wires the registration).

Screen evidence grade (UI-15): the studio projects its host evidence onto
`SportaScreenEvidenceGrade` (`real`→`real`, `fixture`→`fixture`) and shows it
at the point of use next to the host badge.

### W11B-4 — the optional live-evidence port seam (additive)

`TransformStudioHostPort` gains ONE optional method (additive; both existing
hosts remain structurally valid):

```ts
readLiveSourceEvidence?(): Promise<readonly StudioLiveSourceView[]>;
```

`StudioLiveSourceView` mirrors the W10 `LiveSessionEvidence` + descriptor
(grade, contentKind, cadenceMs, queueBound, framesConsumed, openedAt,
closedAt, closeReason, refusal) as structural shapes (the studio-lane law:
no direct @sporta/* runtime imports in the studio render modules). Hosts
without a live composition omit the method; the workbench shows an honest
"not composed into this host" empty state — never fabricated evidence. The
REAL live evidence display is proven at the composition level by driving the
REAL `LiveTransformRunService` + `RealLocalHttpLiveSourceAdapter` (a real
localhost HTTP session, real child-process run) and projecting the pinned
`LiveSessionEvidence` through the display mapping (see the tests).

### Presentation-module law (unchanged)

`workbench.ts`, `liveSourceViews.ts`, `studioRegistration.ts` join the pure
view-model set (no react, no IO, battery-tested). The React panels
(`TransformStudio.tsx`, `SourceRail.tsx`, `PipelinePicker.tsx`,
`GraphPanel.tsx`, `PreviewPanel.tsx`, `LaunchPanel.tsx`, `StatusPanel.tsx`,
`StudioSummaries.tsx`) render state; each src file stays under the 400-line
law. The legacy tab files (GraphBuilderTab/MarketplaceTab/LaunchTab/AppsTab)
are deleted — no out-of-lane importer exists (verified).

### Honest-evidence law (unchanged, restated)

Grades flow VERBATIM (`real` / `real-local-live` / `measured` / `fixture` /
`declared` per seam vocabulary); fixture is labeled fixture; refusals are
displayed as refusals; typed errors propagate; success is never fabricated.
