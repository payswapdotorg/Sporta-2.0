import type { EditOperation } from "../domain/operations.js";
import type { EditorAdapterPort, EditorHashFn } from "../domain/ports.js";
/**
 * Fixture editor adapters (fixture-grade, in-memory).
 *
 * They prove both reconcile paths: a KNOWN project format adapter
 * ("kdenlive", round-trip capable) and an UNKNOWN project tool
 * ("mystery-app", export-only, no declared known formats). Real editor
 * adapters over ZCode workspace facilities arrive in Wave 2.
 */

function sortedEntries(projectState: object): [string, unknown][] {
  return Object.entries(projectState).sort(([left], [right]) =>
    left < right ? -1 : left > right ? 1 : 0,
  );
}

/**
 * Kdenlive fixture adapter: declares the "kdenlive" project format as
 * understood at integration level 2 (round-trip). Derives typed set
 * operations from the changed project state's top-level keys.
 */
export class KdenliveFixtureAdapter implements EditorAdapterPort {
  readonly editorId = "kdenlive";
  readonly editorVersion = "24.08.0";
  readonly integrationLevel: 1 | 2 | 3 = 2;
  readonly licensing = "GPL-3.0";
  readonly knownProjectFormats: readonly string[] = ["kdenlive"];

  constructor(private readonly hash: EditorHashFn) {}

  deriveOperations(projectState: unknown): readonly EditOperation[] {
    if (typeof projectState !== "object" || projectState === null) return [];
    if (Array.isArray(projectState)) return [];
    return sortedEntries(projectState).map(([key, value]) => ({
      kind: "set" as const,
      path: `/${key}`,
      valueHash: this.hash(JSON.stringify(value)),
    }));
  }
}

/**
 * Mystery fixture adapter: an external tool whose project model Sporta
 * does not understand — export-only (level 1), no known project formats.
 * Every reconcile through it takes the opaque-import path.
 */
export class MysteryAppFixtureAdapter implements EditorAdapterPort {
  readonly editorId = "mystery-app";
  readonly editorVersion = "0.1.0-fixture";
  readonly integrationLevel: 1 | 2 | 3 = 1;
  readonly licensing = "proprietary-fixture";
  readonly knownProjectFormats: readonly string[] = [];

  deriveOperations(_projectState: unknown): readonly EditOperation[] {
    return [];
  }
}
