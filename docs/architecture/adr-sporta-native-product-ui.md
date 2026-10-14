# Accepted Architecture Change — Sporta-Native Product UI

**Status:** ACCEPTED FOR IMPLEMENTATION  
**Date:** 2026-10-14  
**Baseline:** Current main after W10 lanes  
**Work order:** docs/work-orders/sporta-native-ui-work-orders.md

## Trigger and confirmed gap

The product owner has clarified that the visible UI must be Sporta's own product experience, not the ZCode application with Sporta features inserted.

The current web implementation is a useful integration proof but is not the finished product UI:

- packages/web/src/sporta/SportaPanel.tsx primarily presents a vertical ProductLoopTrace/stage diagnostic, learning-consent actions and a takeover-label form, then mounts Transform Studio beneath them.
- sportaPanel.css constrains the main panel to a narrow single column; studio.css similarly presents a simple tabbed panel. These are implementation-oriented surfaces, not the complete creative/sports-production workbench.
- packages/web/src/main.tsx imports @zcode/ui/styles.css and the ZCode UI/theme at module level. The /sporta path skips mounting ZCode Root, but global ZCode styling and entrypoint coupling remain.

These are direct source observations, not an assertion that the current route mounts the full ZCode Root shell.

## Decision

Make the /sporta experience a first-class **Sporta-native product application**. ZCode remains the internal execution/workspace substrate; its visible brand, shell, theme and information architecture must not define the Sporta experience.

The primary experience is a creative feed-to-output workspace: source feed, transform pipeline, preview/event timeline, running state, output artifacts and the marketplace to find approved pipelines. Connected applications are part of the workbench because agents need to use them alongside existing browser/terminal capabilities.

## Binding UI requirements

1. The user-facing product name, shell, navigation, language, visual tokens and interaction hierarchy are Sporta's—not ZCode's. Do not mount ZCode Root or reuse its branded app shell on /sporta.
2. The Sporta route must not depend visually on @zcode/ui/styles.css, Zai/ZCode theme classes, logos, typography presets or global navigation. The TL chooses route/code splitting or a dedicated entry so global CSS does not leak into the Sporta shell. Generic unbranded low-level components may be reused if they can be fully styled and do not force ZCode information architecture.
3. Preserve the execution substrate: do not fork or replace AgentRuntime, tool execution, workspace, session, credential, permission, or compute authorities to achieve the visual redesign.
4. The product home is user-task-oriented, not a diagnostic stage dump. Show useful next actions, recent work, source/feed entry points and outputs. Detailed ProductLoopTrace/evidence is available on run details or an expandable activity/evidence panel, not as the landing page's primary content.
5. The main Studio has a purposeful media workflow: choose prerecorded/live source, discover/select an approved pipeline, inspect/edit a visual transform graph, preview the transformation and its events, configure a run, monitor honest progress, and inspect resulting artifacts.
6. Marketplace, creator/publishing, connected applications, runs and artifact library are coherent first-class destinations. Do not expose four disconnected tabs as a substitute for product navigation.
7. The UI must state what is a real service, local-only capability, or fixture/demo without presenting fixture data as production. Evidence-grade labels should inform—not overwhelm—the workflow.
8. Every displayed control must have working behavior or be clearly disabled with an explanation. Errors, empty states, permissions, review gates, fees, refusals and disconnected applications need product-language handling.
9. Responsive behavior, keyboard operation, focus visibility, contrast and screen-reader semantics are release requirements.
10. Product UI completion requires real browser-driven journey evidence and reviewed desktop/mobile screenshots. Typecheck, unit tests or component-only rendering are insufficient visual evidence.

## Product information architecture

The baseline navigation is:

- **Home** — create from feed, resume work, recent runs and outputs.
- **Studio** — feed/source selection, transform graph, preview/event timeline, launch and run monitoring.
- **Transform Marketplace** — browse/search approved pipelines, inspect capabilities, publisher, review status, terms/price, input rights, resource expectations and limitations.
- **My Pipelines** — drafts, versions, submissions, review feedback, release history and publication controls.
- **Runs** — running/finished/refused jobs, per-step progress/evidence, resource/cost/latency facts and failure recovery.
- **Library** — output assets, editable projects, content revisions, provenance, export and lineage.
- **Connected Apps** — attach/discover applications, show grants and capabilities, observe/control as separate permissions, audit effects and revoke access.
- **Settings** — user preferences, learning consent, workspace and policy controls.

The TL can simplify or combine a destination if product-flow tests prove a better information architecture. Any change must keep these tasks easy to discover and must be recorded in the UI work order.

## Component and route ownership

- TL owns the web entrypoint, route isolation, final mount, root package/lockfile and shared screen/host contracts.
- Worker A owns the Sporta-native shell, navigation, responsive layout and Home.
- Worker B owns the Studio/feed-to-output workflow and its visual graph/preview experience.
- Worker C owns the standalone Marketplace, My Pipelines, Runs, Library and Connected Apps screens plus browser-level acceptance for the full product journey.
- Workers work in disjoint directory boundaries; shared contracts and route wiring are frozen and TL-serialized.

## Release gate

The W11 UI workstream passes only when docs/testing/sporta-native-ui-acceptance.md passes on the exact integration SHA, a browser E2E test reaches the real /sporta route, desktop/mobile screenshots are reviewed, and there is no ZCode-branded shell or global ZCode theme on the Sporta product surface. Until then, record the UI as not product-complete even if Studio composition tests pass.
