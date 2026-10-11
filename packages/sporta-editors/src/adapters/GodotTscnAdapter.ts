import type { EditOperation } from "../domain/operations.js";
import type { EditorAdapterPort, EditorHashFn } from "../domain/ports.js";
import { parseGodotTscn, serializeGodotTscn } from "./godotTscn.js";
import type { GodotTscnState } from "./godotTscn.js";
/**
 * Real Godot editor adapter — round-trip import/export for the Godot
 * text scene (.tscn) document shape (adapters layer).
 *
 * Honest understanding model (see godotTscn.ts and the SPEC Wave 6
 * round-trip expansions section): the [gd_scene] header, ext/sub
 * resource sections and node sections with their typed property
 * literals; node order and parent paths are preserved; unknown sections
 * and unmodeled literals are carried through VERBATIM and re-emitted
 * byte-identically. Nothing is guessed and nothing is silently dropped;
 * a document that is not a .tscn text scene is a typed GodotTscnError.
 */
export class GodotTscnAdapter implements EditorAdapterPort {
  readonly editorId = "godot";
  /** The Godot release whose text-scene shape this adapter models. */
  readonly editorVersion = "4.3.0";
  readonly integrationLevel: 1 | 2 | 3 = 2;
  readonly licensing = "MIT";
  readonly knownProjectFormats: readonly string[] = [
    "application/x-godot-scene",
    ".tscn",
  ];

  constructor(private readonly hash: EditorHashFn) {}

  /**
   * Derive typed set operations from a changed project state. Godot
   * (tscn-shaped) states get granular per-section paths; any other object
   * state falls back to honest top-level carry (mirrors the Kdenlive
   * precedent). Non-objects derive nothing.
   */
  deriveOperations(projectState: unknown): readonly EditOperation[] {
    if (typeof projectState !== "object" || projectState === null || Array.isArray(projectState)) {
      return [];
    }
    const operations: EditOperation[] = [];
    const state = projectState as Record<string, unknown>;
    if (isTscnShaped(state.tscn)) {
      operations.push(...tscnOperations(state.tscn, this.hash));
    }
    for (const [key, value] of Object.entries(state).sort(([left], [right]) =>
      left < right ? -1 : left > right ? 1 : 0,
    )) {
      if (key === "tscn") continue;
      operations.push({
        kind: "set",
        path: `/${key}`,
        valueHash: this.hash(JSON.stringify(value)),
      });
    }
    return operations;
  }

  /** Parse a real .tscn text scene into the canonical state. */
  parseGodotTscnDocument(source: string): GodotTscnState {
    return parseGodotTscn(source);
  }

  /**
   * Export a canonical Godot scene state to a well-formed .tscn document.
   * Known parts are emitted canonically; unknown sections are re-emitted
   * with their raw source text, byte-identically.
   */
  exportToGodotTscn(state: GodotTscnState): string {
    return serializeGodotTscn(state);
  }
}

function isTscnShaped(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sortedEntries(record: Record<string, unknown>): [string, unknown][] {
  return Object.entries(record).sort(([left], [right]) =>
    left < right ? -1 : left > right ? 1 : 0,
  );
}

function tscnOperations(
  tscn: Record<string, unknown>,
  hash: EditorHashFn,
): readonly EditOperation[] {
  const operations: EditOperation[] = [];
  const set = (path: string, value: unknown): void => {
    operations.push({ kind: "set", path, valueHash: hash(JSON.stringify(value)) });
  };
  if (isTscnShaped(tscn.header) && isTscnShaped(tscn.header.attributes)) {
    for (const [key, value] of sortedEntries(tscn.header.attributes)) {
      set(`/tscn/header/${key}`, value);
    }
  }
  if (Array.isArray(tscn.sections)) {
    tscn.sections.forEach((section, index) => {
      if (typeof section !== "object" || section === null) return;
      set(`/tscn/sections/${index}`, section);
      const record = section as Record<string, unknown>;
      if (isTscnShaped(record.properties)) {
        for (const [key, value] of sortedEntries(record.properties)) {
          set(`/tscn/sections/${index}/properties/${key}`, value);
        }
      }
    });
  }
  return operations;
}
