import type { EditOperation } from "../domain/operations.js";
import type { EditorAdapterPort, EditorHashFn } from "../domain/ports.js";
import { parseAudacityAup, serializeAudacityAup } from "./audacityAup.js";
import type { AudacityProjectState } from "./audacityAup.js";
/**
 * Real Audacity editor adapter — round-trip import/export for the legacy
 * 2.x XML project (.aup) document shape (adapters layer).
 *
 * Honest understanding model (see audacityAup.ts and the SPEC Wave 6
 * round-trip expansions section): project attributes, the tags block,
 * the wavetrack/waveclip/sequence/waveblock chains with their external
 * alias/summary file references — the sample data itself stays external
 * (exactly how .aup works; the Kdenlive-MLT law). Everything else is
 * carried through VERBATIM as raw source markup and re-emitted
 * byte-identically; a document that is not an .aup project is a typed
 * AudacityAupError.
 */
export class AudacityAupAdapter implements EditorAdapterPort {
  readonly editorId = "audacity";
  /** The Audacity release whose .aup document shape this adapter models. */
  readonly editorVersion = "2.4.2";
  readonly integrationLevel: 1 | 2 | 3 = 2;
  readonly licensing = "GPL-2.0+";
  readonly knownProjectFormats: readonly string[] = ["application/x-audacity-project"];

  constructor(private readonly hash: EditorHashFn) {}

  /**
   * Derive typed set operations from a changed project state. Audacity
   * (aup-shaped) states get granular per-element paths; any other object
   * state falls back to honest top-level carry (mirrors the Kdenlive
   * precedent). Non-objects derive nothing.
   */
  deriveOperations(projectState: unknown): readonly EditOperation[] {
    if (typeof projectState !== "object" || projectState === null || Array.isArray(projectState)) {
      return [];
    }
    const operations: EditOperation[] = [];
    const state = projectState as Record<string, unknown>;
    if (isAupShaped(state.project)) {
      operations.push(...projectOperations(state.project, this.hash));
    }
    for (const [key, value] of Object.entries(state).sort(([left], [right]) =>
      left < right ? -1 : left > right ? 1 : 0,
    )) {
      if (key === "project") continue;
      operations.push({
        kind: "set",
        path: `/${key}`,
        valueHash: this.hash(JSON.stringify(value)),
      });
    }
    return operations;
  }

  /** Parse a real Audacity .aup document into the canonical state. */
  parseAudacityAupDocument(xml: string): AudacityProjectState {
    return parseAudacityAup(xml);
  }

  /**
   * Export a canonical Audacity project state to a well-formed .aup
   * document. Known parts are emitted canonically; unknown elements are
   * re-emitted with their raw source markup, byte-identically.
   */
  exportToAudacityAup(state: AudacityProjectState): string {
    return serializeAudacityAup(state);
  }
}

function isAupShaped(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sortedEntries(record: Record<string, unknown>): [string, unknown][] {
  return Object.entries(record).sort(([left], [right]) =>
    left < right ? -1 : left > right ? 1 : 0,
  );
}

function projectOperations(
  project: Record<string, unknown>,
  hash: EditorHashFn,
): readonly EditOperation[] {
  const operations: EditOperation[] = [];
  const set = (path: string, value: unknown): void => {
    operations.push({ kind: "set", path, valueHash: hash(JSON.stringify(value)) });
  };
  if (isAupShaped(project.attributes)) {
    for (const [key, value] of sortedEntries(project.attributes)) {
      set(`/project/attributes/${key}`, value);
    }
  }
  if (Array.isArray(project.children)) {
    project.children.forEach((child, index) => {
      if (typeof child !== "object" || child === null) return;
      set(`/project/children/${index}`, child);
      const record = child as Record<string, unknown>;
      if (record.type === "wavetrack" && Array.isArray(record.children)) {
        record.children.forEach((clip, clipIndex) => {
          if (typeof clip !== "object" || clip === null) return;
          set(`/project/children/${index}/children/${clipIndex}`, clip);
        });
      }
      if (record.type === "tags" && Array.isArray(record.tags)) {
        record.tags.forEach((tag, tagIndex) => {
          if (typeof tag !== "object" || tag === null) return;
          set(`/project/children/${index}/tags/${tagIndex}`, tag);
        });
      }
    });
  }
  return operations;
}
