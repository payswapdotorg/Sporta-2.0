# Sporta 2.0 Tech Lead Handoff

## Mission

Implement the entire Sporta 2.0 architecture in this repository. The repository is the sole source of truth.

## Mandatory reading

AGENTS.md
docs/source-of-truth.md
docs/architecture/adr-zcode-substrate.md
docs/architecture/sporta-architecture-lock.md
docs/architecture/sporta-dependency-graph.md
docs/architecture/module-migration-map.md
docs/contracts/
docs/architecture/editor-integration.md
docs/architecture/deployment.md
docs/roadmap/sporta-roadmap.md
docs/work-orders/sporta-work-orders.md
docs/testing/sporta-acceptance.md
docs/agent-handoff/sporta-worker-packets.md

## Operating mode

1. Verify repository state.
2. Freeze Wave 0 contracts and module boundaries.
3. Dispatch Workers A/B/C concurrently.
4. Keep all shared-root work serialized.
5. Continuously integrate only at explicit seam points.
6. Use real evidence and fixture evidence as separate categories.
7. When infrastructure blocks a proof, use another compatible provider or local/manual path when the contract permits.
8. Never weaken acceptance criteria.

## Worker routing

A = Intent / WorkGraph / Organizations / Lab / Evaluation.

B = Artifacts / Editors / Sports World / Compute.

C = Arena / Capability Gaps / UX / Deployment / policy propagation.

## TL ownership

- architecture lock;
- public contract exports;
- root package/lockfile changes;
- cross-worker integration;
- architecture-policy changes;
- final E2E;
- acceptance status;
- promotion gates.

## Integration checkpoints

After each worker wave:

- architecture check;
- typecheck;
- lint;
- targeted tests;
- product E2E when UX changed;
- drift audit;
- update docs/PROJECT-STATE.md with exact SHA/evidence.

## No-chat requirement

A replacement TL must be able to implement from this repository alone.
