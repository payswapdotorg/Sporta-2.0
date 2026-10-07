# Artifact Edit & Round-Trip Contract

## Lifecycle

source -> working -> derived -> exported -> externally edited -> imported revision -> re-evaluated

## Export

Exports may include raw media/data, editable projects and interchange assets, provided rights allow it.

Every export has a manifest containing:

- source Artifact IDs;
- revision IDs;
- hashes;
- rights/provenance;
- project metadata;
- adapter/tool version.

## Import/reconciliation

1. detect changed project state;
2. verify scope;
3. hash changed resources;
4. construct EditDelta;
5. create a new ArtifactRevision;
6. preserve prior revisions;
7. record external tool/version;
8. optionally start learning evaluation.

Unknown/partially understood projects become opaque imported artifacts; they must never overwrite canonical history.

## Integration levels

1. export-only;
2. round-trip project;
3. live/shared session.

Initial candidates: Kdenlive, Blender, Godot, Krita, Inkscape, Audacity, Penpot.
