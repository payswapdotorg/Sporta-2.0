# W11 Work Orders — Sporta-Native Product UI

**Directive:** Product owner request, 2026-10-14 — “The UI should be that of the product, not ZCode.”  
**Architecture:** docs/architecture/adr-sporta-native-product-ui.md and docs/architecture/sporta-product-ui.md.  
**Baseline:** current main after W10 integration. This work is a new UI workstream, not a claim that the existing Studio mount is already a product-native shell.

## TL-only Wave 0 — required before worker dispatch

1. Inspect the actual current /sporta route and current source, including SportaPanel.tsx, sportaPanel.css, studio/TransformStudio.tsx, studio.css and packages/web/src/main.tsx. Keep the evidence notes: the route currently displays a ProductLoopTrace-oriented panel with consent/takeover controls plus a nested Studio; main statically imports ZCode UI CSS/theme.
2. Record the visual baseline and make a product-vs-substrate boundary decision: ZCode is internal runtime/workspace/tool infrastructure only. The visual route must not mount ZCode Root or inherit its global theme/brand.
3. Freeze route/screen and host-port contracts shared by workers; identify each screen's existing read/write ports. Workers may not invent a parallel state owner for marketplace, app attachments, runs, artifact lineage, consent or execution.
4. Assign disjoint roots exactly as below and confirm package/web tests, architecture checks, TypeScript build and available browser test infrastructure. If browser automation is not available, choose/approve the smallest maintainable browser harness and serialize dependency/lockfile changes at the TL station.
5. Set a visual acceptance review: desktop 1440x900 and mobile 390x844; a product owner or named reviewer must inspect screenshots and user flow, not only the CI summary.
6. Keep current W10 facts and evidence unchanged. Do not retrospectively relabel a build-only test as browser verified.
7. Update the authoritative project-state record to W11 in flight and attach this handoff; only TL integration can change it to complete.

## Worker A — Product shell, navigation, and Home

**Owns only:** packages/web/src/sporta/product/** plus docs/implementation/worker-ui-a.md.

- Build the Sporta-native root shell and navigation according to docs/architecture/sporta-product-ui.md.
- Create distinct Sporta tokens/theme and unbranded reusable controls; do not rely on ZCode theme classes or styles.
- Implement Home as a feed/media task entrypoint (recorded feed, live source, resume project, recent runs/outputs, meaningful empty states).
- Provide screen registration and route state through TL-frozen contracts. Do not edit main.tsx, SportaPanel.tsx, shared package manifests, or Studio/Marketplace/App screen roots.
- Maintain responsive layout, keyboard navigation, error/empty/loading states and product copy.
- Acceptance: the shell clearly reads as a sports/media production product rather than a code IDE or debug dashboard.

## Worker B — Studio and feed-to-output workbench

**Owns only:** packages/web/src/sporta/studio/** plus docs/implementation/worker-ui-b.md.

- Replace the narrow/tab-only implementation presentation with a purposeful feed/source → pipeline graph → preview/event context → run/output flow.
- Treat graph editing, pipeline validation, sample preview, source selection, run confirmation and status/evidence as one coherent workflow.
- Integrate the existing real TransformStudioHostPort/host composition, TransformRunService and marketplace admission contracts; display returned refusals verbatim and never fabricate success.
- Rework the legacy Marketplace/Apps tabs into useful routes/links or concise summaries that point at Worker C's first-class screens; do not create another marketplace/app authority.
- Preserve exact evidence-grade labels and input/pipeline/output version and rights disclosures.
- Acceptance: on desktop the Studio uses the main work area for graph/preview/feed context; mobile keeps core actions accessible without horizontal page overflow.

## Worker C — Marketplace, creator, runs, library, Connected Apps and browser evidence

**Owns only:**
- packages/web/src/sporta/marketplace/**
- packages/web/src/sporta/apps/**
- packages/web/src/sporta/runs/**
- packages/web/src/sporta/library/**
- packages/web/test/sporta-product-ui/**
- docs/implementation/worker-ui-c.md

Responsibilities:
- Create product-native destination screens for public listings/details, creator draft/review status, run history/evidence, artifact revisions/export, and connected-app scopes/revocation.
- Reuse existing module contracts/read models; no direct UI-to-repository/service/runtime imports and no duplicate state.
- Make every visible action functional or explicitly disabled with a reason.
- Build browser-level journey coverage for /sporta, including navigation, opening Studio, selecting a source and approved pipeline, inspecting run/output/evidence, and viewing app permission/revoke state. At least one real permitted app capability/revocation path must be exercised if the existing host makes it available; fixture cases remain explicitly labeled.
- Produce screenshot/evidence at 1440x900 and 390x844 and review console/network failures. The test must exercise the route through a browser, not only render components.
- Acceptance: screens are coherent with the shared Sporta theme and do not replicate a ZCode IDE layout.

## TL-owned integration

- Own packages/web/src/main.tsx, SportaPanel.tsx, sportaPanel.css, packages/web/index.html, Vite/entrypoint changes, root/package manifests, lockfile, shared host and route contracts, and all cross-worker integration files.
- Ensure the /sporta route cannot inherit or require the ZCode global UI stylesheet/theme. If needed, split route entrypoints or load ZCode-only styles only on ZCode routes.
- Replace the ProductLoopTrace-first panel as the main entry with the Sporta product shell. Preserve trace, consent and takeover capability behind suitable product contexts such as Run Details / Evidence / Learning Preferences.
- Keep ZCode AgentRuntime and tool infrastructure behind service/capability adapters. Do not reimplement browser, terminal or runtime.
- Review screenshots and execute gates after each merge. Merge only disjoint code roots; contract and integration seams remain TL-serialized.

## Acceptance walk-through

Open /sporta → Sporta-branded Home → start recorded/live feed workflow → browse approved Transform Marketplace listing → open Studio and inspect graph/preview/events → confirm rights, version and resource/price disclosure → run through existing host/runtime/transform seams → inspect progress, typed failure or success honestly → inspect result in Library with source/release lineage → open Connected Apps and inspect/grant narrow capability → verify action/audit/revocation state → inspect Run Details / Evidence / learning consent where relevant.

## Non-negotiables

- Do not declare product UI complete from tsc, node tests or mounting TransformStudio alone.
- Do not change Sporta UI into a coding IDE, agent chat clone, developer debug panel or branded ZCode copy.
- Do not remove honest real/fixture labels.
- Do not add a second source of truth or weaken existing P9/P10 acceptance.
- Every worker report uses the standard sections: WORK ITEMS / CHANGED FILES / TESTS / REAL EVIDENCE / FIXTURE EVIDENCE / CONTRACT CHANGES / SECURITY / PERFORMANCE / RISKS / BLOCKERS / DEVIATIONS / NEXT DEPENDENCIES.
