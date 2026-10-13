# P9 Work Orders — Transform Studio, Marketplace and Application Environments

**Status:** Ready for TL Wave 0 planning. No implementation worker starts until the TL freezes package roots, contracts, architecture-policy entries and ownership.
**Architecture authority:** `docs/architecture/adr-transform-studio-marketplace-and-application-environments.md`

## TL-only Wave 0

1. Keep the released P0–P8 baseline separate from new P9 work.
2. Freeze the proposed public records, event order, error taxonomy, sandbox ports and policy behavior.
3. Define package roots and architecture-policy entries only when roots exist:
   - `sporta-transforms`: typed DAG, resolution/composition, execution manifest, semantic/event evidence;
   - `sporta-marketplace`: candidate submission/review, listings/offers, entitlements and suspension;
   - `sporta-app-environments`: descriptors, attachments, scoped grants and action audit.
4. Declare one-way dependency direction. Transform nodes consume existing work/artifact/world/compute/policy and ZCode capability ports. Marketplace depends on transform read/manifest ports, policy and artifact refs. App environments reuse ZCode workspace/runtime/tool/session boundaries. Product projections consume the modules. No cycles.
5. Decide whether app connectors themselves can be marketplace listings in v1; publishing a pipeline never grants a user access to an attached app.
6. Freeze module manifests, contracts/examples, failure semantics, rights/retention, architecture policy, integration points and acceptance before parallel work.
7. Select the first vertical slice: local prerecorded feed, one deterministic no-model transform, one model-backed node behind an adapter, one real attached app, local sandbox and a reviewed free listing. Live feed must use the same contract but cannot be described as production-live until measured.
8. Measure baseline architecture/typecheck/lint/tests; do not weaken existing gates.

## Worker A — Transform graph and execution

Own only `packages/sporta-transforms/**` plus its report.

- Implement manifest, typed DAG validation, pinned component references, graph resolution/composition, bounded execution plan, step provenance and TransformRunManifest.
- Compose through existing WorkGraph, ZCode runtime, Artifact Fabric, World and Compute ports. No second task/job/runtime authority.
- Provide deterministic script/filter example and one model-provider adapter lane; declare typed input/output, errors, cancellation and resource limits.
- Test event/entity identity, order, timestamps, uncertainty and provenance carry-forward; changes/dropped data must be explicit.
- Produce immutable output artifact revisions with replayable evidence.

## Worker B — Marketplace and publication lifecycle

Own only `packages/sporta-marketplace/**` plus its report.

- Implement draft/submission, automated gate report, human review, listing, approved immutable versions, update re-review, suspension/withdrawal and entitlement.
- Define free and paid offer records behind a provider-neutral payment port. The first slice may use a fixture/mocked settlement adapter, clearly labeled.
- Require rights/provenance attestations, component/model license declarations, SBOM/digest pins, permission review, quality evidence and reviewer identity.
- A new repository commit or model reference never auto-publishes. Free listings receive the same review as paid listings.
- Prove a reviewed release digest stays identical from decision to listing to run and an unreviewed update is not selectable.

## Worker C — Application Environment and product experience

Own only `packages/sporta-app-environments/**`, narrowly assigned product UX files, and its report.

- Implement generic app descriptor, observe/control/semantic-binding capability declarations, scoped user grants, expiry/revocation and audit trail.
- Reuse ZCode runtime/workspace/session/browser/terminal/credential/permission boundaries; no second runtime and no app-specific shell surface.
- Implement Transform Studio graph building/validation, sample preview, marketplace/review status and pipeline selection at prerecorded/live feed launch.
- Demonstrate a real local app action over the real agent/tool path and reconcile its verified effect into the existing WorkGraph/artifact lineage.
- Show app permissions, data scope, pipeline approval/version, licenses, limitations and price clearly.

## TL integration gates

The TL owns shared contract exports, package registration, lockfile, architecture policy and integration. Worker ownership must be disjoint. Shared manifests and cross-package seams are serialized by the TL.

One coherent release-candidate journey:

```text
creator builds graph -> graph validates -> immutable candidate submitted
 -> automated gates + human review -> v1 published
 -> user selects v1 for a feed -> rights + entitlement pass
 -> pinned execution -> output artifact + event evidence
 -> agent calls attached app with scoped grant -> verified effect is reconciled
 -> creator submits v2 -> separate review -> historical v1 remains reproducible
```

Every report includes WORK ITEMS / CHANGED FILES / TESTS / REAL EVIDENCE / FIXTURE EVIDENCE / CONTRACT CHANGES / RIGHTS-PROVENANCE / PERFORMANCE / SECURITY / RISKS / BLOCKERS / DEVIATIONS / NEXT DEPENDENCIES.
