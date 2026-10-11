import type { EditOperation } from "../domain/operations.js";
import type { EditorAdapterPort, EditorHashFn } from "../domain/ports.js";
import { serializeInkscapeSvg, parseInkscapeSvg } from "./inkscapeSvg.js";
import type { InkscapeProjectState } from "./inkscapeSvg.js";
/**
 * Real Inkscape editor adapter — round-trip import/export for the SVG 1.1
 * document shape used by .svg vector documents (adapters layer).
 *
 * Honest understanding model (see inkscapeSvg.ts and the SPEC Wave 6
 * round-trip expansions section): the <svg> root geometry attributes,
 * document-ordered layer groups with stable element ids, and the <path>
 * geometry data — everything else is carried through VERBATIM as raw
 * source markup and re-emitted byte-identically on export. Nothing is
 * guessed and nothing is silently dropped; a document that is not SVG is
 * a typed InkscapeSvgError.
 */
export class InkscapeAdapter implements EditorAdapterPort {
  readonly editorId = "inkscape";
  /** The Inkscape release whose document shape this adapter models. */
  readonly editorVersion = "1.4.2";
  readonly integrationLevel: 1 | 2 | 3 = 2;
  readonly licensing = "GPL-3.0";
  readonly knownProjectFormats: readonly string[] = ["image/svg+xml"];

  constructor(private readonly hash: EditorHashFn) {}

  /**
   * Derive typed set operations from a changed project state. Inkscape
   * (SVG-shaped) states get granular per-element paths; any other object
   * state falls back to honest top-level carry (mirrors the Kdenlive
   * precedent). Non-objects derive nothing.
   */
  deriveOperations(projectState: unknown): readonly EditOperation[] {
    if (typeof projectState !== "object" || projectState === null || Array.isArray(projectState)) {
      return [];
    }
    const operations: EditOperation[] = [];
    const state = projectState as Record<string, unknown>;
    if (isSvgShaped(state.svg)) {
      operations.push(...svgOperations(state.svg, this.hash));
    }
    for (const [key, value] of Object.entries(state).sort(([left], [right]) =>
      left < right ? -1 : left > right ? 1 : 0,
    )) {
      if (key === "svg") continue;
      operations.push({
        kind: "set",
        path: `/${key}`,
        valueHash: this.hash(JSON.stringify(value)),
      });
    }
    return operations;
  }

  /** Parse an SVG 1.1 (Inkscape) document into the canonical state. */
  parseInkscapeSvgDocument(xml: string): InkscapeProjectState {
    return parseInkscapeSvg(xml);
  }

  /**
   * Export a canonical Inkscape project state to a well-formed SVG
   * document. Known parts are emitted canonically; unknown elements are
   * re-emitted with their raw source markup, byte-identically.
   */
  exportToInkscapeSvg(state: InkscapeProjectState): string {
    return serializeInkscapeSvg(state);
  }
}

function isSvgShaped(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function svgOperations(
  svg: Record<string, unknown>,
  hash: EditorHashFn,
): readonly EditOperation[] {
  const operations: EditOperation[] = [];
  const set = (path: string, value: unknown): void => {
    operations.push({ kind: "set", path, valueHash: hash(JSON.stringify(value)) });
  };
  if (isSvgShaped(svg.attributes)) {
    for (const [key, value] of Object.entries(svg.attributes).sort(([left], [right]) =>
      left < right ? -1 : left > right ? 1 : 0,
    )) {
      set(`/svg/attributes/${key}`, value);
    }
  }
  if (Array.isArray(svg.children)) {
    svg.children.forEach((child, index) => {
      if (typeof child !== "object" || child === null) return;
      set(`/svg/children/${index}`, child);
      const layer = child as Record<string, unknown>;
      if (layer.type === "layer" && Array.isArray(layer.children)) {
        layer.children.forEach((grandchild, childIndex) => {
          if (typeof grandchild !== "object" || grandchild === null) return;
          set(`/svg/children/${index}/children/${childIndex}`, grandchild);
          if ((grandchild as Record<string, unknown>).type === "path") {
            set(
              `/svg/children/${index}/children/${childIndex}/d`,
              (grandchild as Record<string, unknown>).d,
            );
          }
        });
      }
    });
  }
  return operations;
}
