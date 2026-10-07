# Sporta 2.0 Deployment Architecture

## Planes

Control: WorkGraph, Organizations, Lab, Arena integration, editor/session metadata.

Artifact: durable immutable media/data/project objects, manifests, revisions and evidence.

Execution: ZCode local runtime, remote workspaces, CPU/GPU workers and editor runtimes.

## Preview target

Vercel-compatible control plane, Neon, R2, Upstash Redis, optional Apify.

## Provider rule

All infrastructure is adapterized. Local, user-owned, hosted and alternate providers are valid execution planes.

Provider outage becomes a typed refusal/fallback; it does not become a semantic failure.

## Durability

Canonical artifacts/manifests survive worker loss. Workers are replaceable.

Heavy editors may remain local or run in remote environments; the control plane owns metadata/reconciliation rather than assuming serverless editor execution.
