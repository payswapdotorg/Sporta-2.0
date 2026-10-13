# Sporta 2.0 Dependency Graph

## Wave 0 — TL only

SP0.1 repository identity/source truth
SP0.2 architecture lock
SP0.3 canonical contracts
SP0.4 dependency graph
SP0.5 acceptance gates
SP0.6 module/architecture policy
SP0.7 worker boundaries

## Wave 1 — three concurrent workers

Worker A: WorkGraph, Intent, Organization model, resolver, Lab/evaluation ports.

Worker B: Artifact Graph, revisions, Editor Broker, initial adapters, SWM seams.

Worker C: CapabilityGap, Arena client, learning intake, product shell, provider/deployment abstractions.

## Wave 2 — three concurrent workers

Worker A: Lab search, organization scoring, personalization, replay, promotion.

Worker B: editor round-trip, project reconciliation, SWM ingestion/perception seams, compute/provider integrations.

Worker C: Arena UX/lifecycle, user takeover UX, hosted/local integration, security/privacy/rights propagation.

## Wave 3 — TL integration with fix-only worker tasks

TL: cross-package integration, architecture drift audit, acceptance, release readiness.

## Concurrency law

Workers edit only owned directories. Shared contract exports, root manifests, lockfiles and architecture policy are TL-owned and serialized.

## Critical path

contracts -> WorkGraph/artifacts/organizations/Arena/editor seams -> Lab + user takeover -> Arena learning -> evaluation/promotion -> complete end-to-end loop


## P9 — Transform Studio / Marketplace / Application Environments (new post-release feature)

**Precondition:** TL-only Wave 0 freezes contracts and architecture-policy strategy; P0–P8 remain the released baseline.

- Worker A: `sporta-transforms` — typed DAG, resolution/composition, execution manifest and semantic/event evidence.
- Worker B: `sporta-marketplace` — submissions, automated/human review, immutable listings, offers, entitlements and suspension.
- Worker C: `sporta-app-environments` plus assigned product UX — app descriptors, scoped grants/audit/revocation and feed/Studio UX.
- TL owns shared contracts, architecture policy, manifests, lockfile, dependency reconciliation and end-to-end acceptance.

Target dependency direction (exact module roots and edges are TL-frozen before code):

```text
sporta-policy + sporta-contracts
  -> existing work / artifacts / world / compute / ZCode tool-session seams
  -> sporta-transforms
  -> sporta-marketplace
product projections consume transforms + marketplace + app-environments
sporta-app-environments -> existing policy + ZCode workspace/runtime/tool capabilities
```

No second runtime, task/run authority, scheduler, artifact authority, rights authority or payment authority. See `docs/work-orders/transform-marketplace-work-orders.md`.
