import { EditorError } from "../domain/errors.js";
import {
  escapeXmlAttribute,
  parseXmlDocument,
  serializeXmlAttributes,
  type XmlElement,
} from "./editorXml.js";
/**
 * Minimal, honest machinery for the Inkscape (SVG 1.1) document shape —
 * adapters layer. Parsing uses the shared strict XML scanner; every
 * failure raises a typed InkscapeSvgError naming the failure point.
 *
 * Honest understanding model (SPEC "Wave 6 — round-trip expansions"):
 * the <svg> root with ALL attributes preserved, direct root children in
 * document order (SVG paint order is semantic), <g
 * inkscape:groupmode="layer"> layers (label, id, remaining attributes)
 * and hollow <path> elements inside layers (id, the `d` data verbatim,
 * remaining attributes). Anything else is carried as an opaque raw
 * fragment and re-emitted byte-identically.
 */

/** Typed failure raised while parsing or emitting an Inkscape SVG document. */
export class InkscapeSvgError extends EditorError {
  constructor(message: string, detail: string) {
    super(message, detail);
  }
}

/** A child element the adapter does not understand, preserved verbatim. */
export interface InkscapeRawElement {
  readonly type: "unknown";
  readonly tag: string;
  /** Exact source markup of the element, from '<' to its closing '>'. */
  readonly raw: string;
}

/** A modeled <path> element: hollow, with its `d` data carried verbatim. */
export interface InkscapePath {
  readonly type: "path";
  /** Stable element id (the `id` attribute), when present. */
  readonly id?: string;
  /** Path geometry data, carried verbatim. */
  readonly d: string;
  /** Remaining attributes, verbatim (fill, stroke, transform, ...). */
  readonly attributes: Readonly<Record<string, string>>;
}

/** A modeled vector layer: <g inkscape:groupmode="layer" ...>. */
export interface InkscapeLayer {
  readonly type: "layer";
  /** Stable element id (the `id` attribute), when present. */
  readonly id?: string;
  /** The inkscape:label value ("" when the attribute is absent). */
  readonly label: string;
  /** Remaining layer attributes, verbatim (transform, style, ...). */
  readonly attributes: Readonly<Record<string, string>>;
  /** Document order of children is preserved (paint order). */
  readonly children: readonly (InkscapePath | InkscapeRawElement)[];
}

/** The <svg> root of an Inkscape document. */
export interface InkscapeSvgDocument {
  readonly type: "svg";
  /** ALL root attributes, verbatim (xmlns, width/height/viewBox, ...). */
  readonly attributes: Readonly<Record<string, string>>;
  /** Document order of children is preserved (SVG paint order). */
  readonly children: readonly (InkscapeLayer | InkscapeRawElement)[];
}

/** Canonical parsed state of one Inkscape SVG document. */
export interface InkscapeProjectState {
  readonly svg: InkscapeSvgDocument;
}

const SVG_XMLNS = "http://www.w3.org/2000/svg";
const INKSCAPE_XMLNS = "http://www.inkscape.org/namespaces/inkscape";

function fail(message: string, detail: string): InkscapeSvgError {
  return new InkscapeSvgError(message, detail);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function rawOf(source: string, element: XmlElement): InkscapeRawElement {
  return { type: "unknown", tag: element.tag, raw: source.slice(element.start, element.end) };
}

/** Childless, whitespace-free content check for attribute-only elements. */
function isHollow(element: XmlElement): boolean {
  return element.children.length === 0 && element.text.trim() === "";
}

function withoutKeys(
  attributes: Readonly<Record<string, string>>,
  keys: readonly string[],
): Record<string, string> {
  const rest: Record<string, string> = {};
  for (const [name, value] of Object.entries(attributes)) {
    if (!keys.includes(name)) rest[name] = value;
  }
  return rest;
}

/** True when the element is a modeled Inkscape layer group. */
function isLayerGroup(element: XmlElement): boolean {
  return element.tag === "g" && element.attributes["inkscape:groupmode"] === "layer";
}

function mapLayer(source: string, element: XmlElement): InkscapeLayer {
  if (element.text.trim() !== "") {
    throw fail(
      `stray character data inside layer <g> (at offset ${element.start})`,
      "stray-text",
    );
  }
  const id = element.attributes.id;
  const label = element.attributes["inkscape:label"] ?? "";
  const attributes = withoutKeys(element.attributes, [
    "inkscape:groupmode",
    "inkscape:label",
    "id",
  ]);
  const children: (InkscapePath | InkscapeRawElement)[] = [];
  for (const child of element.children) {
    if (child.tag === "path" && isHollow(child) && child.attributes.d !== undefined) {
      const { d } = child.attributes;
      const rest = withoutKeys(child.attributes, ["id", "d"]);
      children.push(
        child.attributes.id === undefined
          ? { type: "path", d, attributes: rest }
          : { type: "path", id: child.attributes.id, d, attributes: rest },
      );
    } else {
      children.push(rawOf(source, child));
    }
  }
  return id === undefined
    ? { type: "layer", label, attributes, children }
    : { type: "layer", id, label, attributes, children };
}

/** The layer subset of a document's root children, in document order. */
export function inkscapeLayersOf(svg: InkscapeSvgDocument): readonly InkscapeLayer[] {
  return svg.children.filter((child): child is InkscapeLayer => child.type === "layer");
}

/** Parse a real Inkscape SVG 1.1 document into the canonical state. */
export function parseInkscapeSvg(source: string): InkscapeProjectState {
  const root = parseXmlDocument(source, fail);
  if (root.tag !== "svg") {
    throw fail(
      `root element <${root.tag}> is not <svg>: not an Inkscape/SVG document`,
      `root:${root.tag}`,
    );
  }
  if (root.text.trim() !== "") {
    throw fail(
      `stray character data inside <svg> (at offset ${root.start})`,
      "stray-text",
    );
  }
  const children: (InkscapeLayer | InkscapeRawElement)[] = root.children.map((child) =>
    isLayerGroup(child) ? mapLayer(source, child) : rawOf(source, child),
  );
  return { svg: { type: "svg", attributes: { ...root.attributes }, children } };
}

/** The root attributes with the SVG and Inkscape namespaces guaranteed. */
function rootAttributes(attributes: Readonly<Record<string, string>>): Record<string, string> {
  const out: Record<string, string> = {};
  out.xmlns = attributes.xmlns ?? SVG_XMLNS;
  out["xmlns:inkscape"] = attributes["xmlns:inkscape"] ?? INKSCAPE_XMLNS;
  for (const [name, value] of Object.entries(attributes)) {
    if (name !== "xmlns" && name !== "xmlns:inkscape") out[name] = value;
  }
  return out;
}

function guardRecord(
  attributes: Readonly<Record<string, string>>,
  forbidden: readonly string[],
  where: string,
): void {
  for (const name of forbidden) {
    if (Object.hasOwn(attributes, name)) {
      throw fail(
        `${where}: attributes must not carry "${name}" (it is emitted separately; emitting both would duplicate the XML attribute)`,
        `duplicate-emission:${name}`,
      );
    }
  }
}

/**
 * Serialize a canonical Inkscape project state to a well-formed SVG
 * document. Modeled parts are emitted canonically; unknown elements are
 * re-emitted with their raw source markup, byte-identically.
 */
export function serializeInkscapeSvg(state: InkscapeProjectState): string {
  if (!isPlainObject(state) || !isPlainObject(state.svg)) {
    throw fail(
      "serializeInkscapeSvg: state is not an Inkscape project state (missing svg)",
      "not-inkscape-state",
    );
  }
  const svg = state.svg as InkscapeSvgDocument;
  if (!Array.isArray(svg.children)) {
    throw fail("serializeInkscapeSvg: svg.children is not an array", "not-inkscape-state");
  }
  const lines: string[] = ['<?xml version="1.0" encoding="utf-8"?>'];
  lines.push(`<svg${serializeXmlAttributes(rootAttributes(svg.attributes))}>`);
  for (const child of svg.children as readonly (InkscapeLayer | InkscapeRawElement)[]) {
    if (child.type === "layer") {
      guardRecord(child.attributes, ["inkscape:groupmode", "inkscape:label", "id"], "layer");
      lines.push(`  <g inkscape:groupmode="layer" inkscape:label="${escapeXmlAttribute(child.label)}"${child.id === undefined ? "" : ` id="${escapeXmlAttribute(child.id)}"`}${serializeXmlAttributes(child.attributes)}>`);
      for (const grandchild of child.children) {
        if (grandchild.type === "path") {
          guardRecord(grandchild.attributes, ["id", "d"], "path");
          lines.push(
            `    <path${grandchild.id === undefined ? "" : ` id="${escapeXmlAttribute(grandchild.id)}"`} d="${escapeXmlAttribute(grandchild.d)}"${serializeXmlAttributes(grandchild.attributes)}/>`,
          );
        } else {
          lines.push(`    ${grandchild.raw}`);
        }
      }
      lines.push("  </g>");
    } else {
      lines.push(`  ${child.raw}`);
    }
  }
  lines.push("</svg>");
  return `${lines.join("\n")}\n`;
}
