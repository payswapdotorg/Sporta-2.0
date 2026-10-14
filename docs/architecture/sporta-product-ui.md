# Sporta-Native Product UI Contract

**Status:** Approved direction for implementation; W11 acceptance is pending.  
**Canonical ADR:** docs/architecture/adr-sporta-native-product-ui.md

## Product experience

Sporta is an intent-driven sports/media transformation environment, not a coding IDE. Its primary interaction is to bring in a prerecorded or live feed, choose/build a useful transformation pipeline, inspect a preview and event timeline, run it, then work with the produced media and evidence. The agent is a collaborative capability inside that flow, not the entire product shell.

## Shell and style boundary

- Product label and page title: Sporta / the product task being performed. Never present ZCode as the user-facing app identity.
- Root layout, navigation, styling tokens, typography and component variants are Sporta-owned.
- The /sporta route cannot mount ZCode Root, navigation/task shell, branded command center, ZCode logo, Zai theme, or depend on ZCode's global stylesheet for its visual presentation.
- If the shared Web entry statically imports ZCode UI styles or theme logic, isolate the Sporta route via a dedicated entry or code/style split. The generic AgentRuntime and tool/session adapters stay underneath the UI boundary.
- Neutral low-level primitives may be reused only if they do not drag in ZCode visual identity, screen layout, theme assumptions or interaction model.
- Create explicit Sporta CSS variables/tokens and component variants. Avoid relying on unscoped element styles or inherited theme classes from another app.
- A media/production workspace should use space for preview, event/timeline context, graph editing and result inspection—not make backend stage IDs the home page.

## Core journeys and screens

### Home
The primary task should be obvious: start from a recorded file or live source, or resume a prior project. Show recent runs/projects, outputs that need attention and clear service/fixture indicators. No raw 12-stage internal trace as the page's dominant content.

### Studio
A coherent workbench for source → pipeline → preview/events → run → outputs. On a wide screen, support a source/project rail, central graph/work area and contextual preview/details panel; adapt to a sensible stacked/tabbed layout on mobile. Show the selected pipeline version, input requirements, rights disclosure, permissions, cost/resource/latency estimate and validation errors before execution. Run status and partial failures must be truthful.

### Transform Marketplace
Useful pipeline cards/listings with category/use case, examples/output types, publisher, approved version, review status, free/paid terms, declared dependencies, input rights requirements, measured-versus-fixture evidence, limitations, compute estimates and clear launch/detail actions. No false ratings/reviews where data does not exist.

### My Pipelines
Author's drafts, immutable versions, submission, review status, change requests, release notes, dependency/rights disclosures, approval history, suspend/withdraw actions as permitted. Public availability is distinguished from a private draft.

### Runs
Run list, current state, selected pipeline digest, source, start/end, per-step progress, output links, evidence, typed failures, refusal/fallback and recoverable actions. Internal debug/event traces may live here as a secondary panel.

### Library
Derived output assets and editable project files, revision history, source lineage, pipeline/run references, export/open-in-editor actions and rights scope. Never collapse immutable history into an overwritable file list.

### Connected Apps
Discover/connect/attach a local/remote/service app. Show target identity, connection state, app version, capability scopes, expiration, who granted access, latest actions and revoke control. Observe and control are separate; attachment consent is separate from learning consent.

### Settings
User-level consent, workspace/default preferences, resource policies and provider/environment settings. Learning consent must be explicit and scoped.

## Product-copy conventions

Say “Feed”, “Pipeline”, “Preview”, “Run”, “Output”, “Library”, “Connected app”, “Review”, “Publisher”, “Permission” and “Evidence” when those describe the user's task. Keep WorkGraph IDs, stage enums, port names, package identifiers and runtime jargon in expandable technical evidence rather than primary navigation or default page headers.

Fixture/local/real status must be visible at the point of use:
- **Fixture/demo** must never look like a real connected service or real source.
- **Real local** must not be called production-live.
- **Real provider** names the actual provider and does not silently downgrade to fixtures on failure.
- A typed refusal should explain the action that failed and the safe next step.

## Accessibility and responsive rules

- Navigation, graph actions, dialog, forms and permission controls keyboard accessible; visible focus and semantic labels.
- Do not depend on color alone for state.
- Desktop and mobile are both first-class, using the same contracts.
- Mobile may move panels into tabs/drawers but must preserve source, chosen pipeline/version, run state and outputs.
- Loading, empty, error, permission-denied, revoked, offline and partially completed states are intentionally designed.

## Browser evidence

Product-native UI is not accepted solely from component tests or a compiled bundle. The release evidence must include:
- a browser-run /sporta route and end-to-end user journey;
- screenshot/evidence at desktop (1440x900) and mobile (390x844);
- browser console/network failure review and actual control interactions;
- a check proving no ZCode brand/shell/global theme leaks into the Sporta page;
- explicit statement whether the run was connected to real services or labeled fixtures.
