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
