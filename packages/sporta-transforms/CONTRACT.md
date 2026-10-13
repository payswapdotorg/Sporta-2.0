# sporta-transforms

Typed transform DAG, resolution/composition and transform-run manifests (P9).

Invariants that types cannot express (source: ADR + transform-marketplace
contract; architecture lock invariants 25-37):

- Pipelines are DAGs; cycles, unknown ports, missing parameters and
  incompatible types fail closed (P9-01).
- Components are pinned by immutable digest; moving tags are never execution
  identity (lock 25/27). Unpinned components are a validation violation.
- Untrusted nodes execute only in isolated bounded sandboxes without default
  host-secret access or unrestricted network egress (lock 32).
- Execution stays a WorkGraph run over the existing ZCode runtime/compute
  seams — this module owns no second runtime, scheduler or task authority.
- Every run pins exact manifest, code/model/dependency/runtime digests and a
  non-secret config hash; secrets never appear in run manifests (P9-03).
- Event/entity identity, order, timestamps, uncertainty and provenance are
  preserved where claimed or explicitly marked changed/dropped; there is no
  hidden semantic drift (P9-04).
- Outputs are immutable Artifact Fabric revisions linked to the input feed
  and WorkGraph; prior revisions remain readable (P9-06).
- Nodes return declared outputs through existing services; they cannot
  directly mutate canonical WorkGraph, marketplace, policy or artifact state.
- Learning from pipeline activity requires independent scoped consent.
