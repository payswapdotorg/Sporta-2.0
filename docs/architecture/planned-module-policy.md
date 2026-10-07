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

Each module must define:
- root;
- owner;
- required dependencies;
- public entrypoints;
- layer order;
- cycle/deep-import constraints;
- contract size limits.

The migration should be incremental. Existing ZCode modules may remain legacy/unmanaged until intentionally migrated.
