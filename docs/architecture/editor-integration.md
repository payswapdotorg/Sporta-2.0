# Editor Integration Architecture

Sporta orchestrates specialist editors; it does not attempt to replace them all.

## Editor Broker

Resolve the best editor capability using:

artifact type, requested operation, user preference, installed/available applications, remote availability, capability, project format, licensing, performance and historical outcomes.

## Integration levels

1. export;
2. round-trip;
3. live/shared session.

## Initial ecosystem

Kdenlive = video timeline.
Blender = 3D/scene.
Godot = interactive/game/tactical.
Krita = raster.
Inkscape = vector.
Audacity = audio.
Penpot = UI/design.

These remain replaceable adapters with explicit version/license/provenance records.

## Session rules

Before opening: verify rights, path, capability, read/write scope and create a checkpoint.

On save/close: reconcile, hash, create revision, emit EditDelta, then run relevant validation.

ZCode local/remote workspace facilities are reused for editor sessions.
