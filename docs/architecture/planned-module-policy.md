# Planned Sporta Module Policy

This document is the pre-implementation target for the repository's existing architecture-policy.yaml.

The TL must convert these planned modules into managed architecture-policy entries as their source roots are created:

- sporta-contracts
- sporta-work
- sporta-organizations
- sporta-lab
- sporta-artifacts
- sporta-editors
- sporta-world
- sporta-compute
- sporta-arena
- sporta-evaluation
- sporta-policy

## Conversion status

- 2026 (Wave 0, TL): all 11 planned modules converted to managed
  architecture-policy entries with frozen public contract entrypoints.
  Roots, owners, requires, public entrypoints, layers
  (domain/app/adapters) and layer order are registered in
  architecture-policy.yaml. See docs/PROJECT-STATE.md for the module
  table and verification evidence.
- 2026 (Wave 1 integration, TL): a 12th managed module `sporta-product`
  (the Worker C product-shell seam, work-order WO-C1) was created by
  Worker C and registered by the TL at integration — not part of the
  original planned list; documented in PROJECT-STATE.md.

Each module must define:
- root;
- owner;
- required dependencies;
- public entrypoints;
- layer order;
- cycle/deep-import constraints;
- contract size limits.

The migration should be incremental. Existing ZCode modules may remain legacy/unmanaged until intentionally migrated.
