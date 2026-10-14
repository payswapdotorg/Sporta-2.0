# W11 Acceptance — Sporta-Native Product UI

W11 is not complete solely because React components compile or Transform Studio is mounted. The actual /sporta route must be exercised in a browser at the exact TL integration SHA.

## Product identity and shell

- **UI-01**: /sporta opens the Sporta-native app shell, not ZCode Root, ZCode navigation, a coding-workspace home screen or a stage-trace debug page.
- **UI-02**: Sporta brand/title, product navigation, visual tokens and component appearance are controlled by Sporta-owned styles. No ZCode logo, ZCode product title, Zai brand or ZCode shell visuals appear.
- **UI-03**: The route does not depend on or visually inherit @zcode/ui/styles.css / ZCode theme classes. If the shared web entrypoint loads them globally, the route is isolated by a split/dedicated entrypoint or equivalent proven style boundary.
- **UI-04**: Primary navigation and URLs/state restoration work for Home, Studio, Transform Marketplace, My Pipelines, Runs, Library and Connected Apps (or TL-approved task-equivalent information architecture).
- **UI-05**: ProductLoopTrace/stage IDs, WorkGraph IDs and low-level provider details are secondary expandable evidence, not landing-page headline/content. No raw internal stage table dominates Home.
- **UI-06**: No placeholder buttons or inert affordances. Every visible action works or is visibly disabled with a reason.

## Product journeys

- **UI-07**: Home starts a user task (recorded source, live source, or resume existing work) and shows truthful recent work/output empty states.
- **UI-08**: Studio connects source/feed selection, approved pipeline choice, graph validation/editing, preview/event information, run confirmation and progress/output.
- **UI-09**: Marketplace shows useful release details: publisher, reviewed version, approval state, intended outputs, limitations, input-rights requirements, dependencies, price/terms, resource/latency expectations and evidence grade.
- **UI-10**: My Pipelines distinguishes private drafts, submitted/reviewing, changes requested, approved/published, suspended and withdrawn releases.
- **UI-11**: Runs displays exact pipeline/source version, state, per-step evidence, typed refusal/fallback and output references without fabricating success.
- **UI-12**: Library shows immutable revisions and source/run/pipeline lineage; export/open actions preserve policy.
- **UI-13**: Connected Apps displays target, connection status, observe/control scopes independently, expiration, recent audited effects and revocation.
- **UI-14**: Learning consent is scoped and separate from app attachment; consent/takeover controls live in the relevant product context.
- **UI-15**: Real, real-local and fixture/demo evidence grades are accurate at the point of use; fixture feeds/apps are not presented as live services.

## Visual, responsive and accessibility evidence

- **UI-16**: Real browser E2E test reaches /sporta through the web entrypoint; it is not only a component-level harness or SSR snapshot.
- **UI-17**: Screenshot evidence for desktop 1440x900 and mobile 390x844 is attached to the review/evidence record and reviewed by the owner/design reviewer.
- **UI-18**: Navigation, dialogs, controls, forms and primary Studio actions work with keyboard and visible focus; status doesn't rely on color alone.
- **UI-19**: At mobile width, no page-level horizontal overflow; key feed/pipeline/run/output actions remain discoverable.
- **UI-20**: Browser console/network failures reviewed; expected fixture/offline/failure behavior is explicitly labeled and assertions include loading, empty, error and refused states.
- **UI-21**: @zcode/ui/styles.css and branded theme are not required by the Sporta presentation. The TL records the implementation isolation choice and regression check.
- **UI-22**: Architecture check, scoped TypeScript build, web tests, product browser E2E and existing P10/P9 regression battery pass with no loosened gates on the integration SHA.

## Release rule

The TL must record all UI-01 through UI-22 with evidence references. If the browser harness or provider is unavailable, the impacted gate stays blocked/deferred and must not be relabeled as passed.
