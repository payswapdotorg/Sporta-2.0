import {
  GodotTscnError,
  LiteralParser,
  parseGodotLiteral,
  serializeGodotValue,
  type GodotValue,
} from "./godotTscnLiterals.js";
/**
 * Minimal, honest machinery for the Godot text scene (.tscn) document
 * shape — adapters layer. A .tscn is line-oriented: a `[gd_scene ...]`
 * header section, then `[ext_resource ...]`, `[sub_resource ...]` and
 * `[node ...]` sections with `key = value` property lines (single-line
 * values — the Godot text emitter never wraps). Unknown sections are
 * carried as opaque raw fragments and re-emitted byte-identically.
 * Every failure raises a typed GodotTscnError naming the section and
 * the 1-based line.
 */

export { GodotTscnError };

/** The `[gd_scene ...]` header; attributes as parsed Godot literals. */
export interface GodotSceneHeader {
  readonly kind: "header";
  readonly attributes: Readonly<Record<string, GodotValue>>;
}

/** One `[ext_resource ...]` section (attributes: type, path, id, ...). */
export interface GodotExtResource {
  readonly kind: "extResource";
  readonly attributes: Readonly<Record<string, GodotValue>>;
}

/** One `[sub_resource ...]` section with its properties. */
export interface GodotSubResource {
  readonly kind: "subResource";
  readonly attributes: Readonly<Record<string, GodotValue>>;
  readonly properties: Readonly<Record<string, GodotValue>>;
}

/** One `[node name="..." type="..." parent="..."]` section. */
export interface GodotNodeSection {
  readonly kind: "node";
  readonly name: string;
  /** Godot node type attribute ("CharacterBody2D", ...), when present. */
  readonly nodeType?: string;
  /** Parent path: absent for the scene root, "." or a path below it. */
  readonly parent?: string;
  /** Remaining node attributes (instance=..., groups=..., ...). */
  readonly attributes: Readonly<Record<string, GodotValue>>;
  readonly properties: Readonly<Record<string, GodotValue>>;
}

/** A top-level section the adapter does not model, carried verbatim. */
export interface GodotOpaqueSection {
  readonly kind: "opaque";
  /** Exact source text of the section, from '[' to its last line. */
  readonly raw: string;
}

export type GodotSceneSection =
  | GodotExtResource
  | GodotSubResource
  | GodotNodeSection
  | GodotOpaqueSection;

/** Canonical parsed state of one .tscn text scene. */
export interface GodotTscnState {
  readonly tscn: {
    readonly header: GodotSceneHeader;
    /** Section order is preserved (node order is semantic). */
    readonly sections: readonly GodotSceneSection[];
  };
}

const KEY_RE = /^[A-Za-z_][A-Za-z0-9_.:/-]*/;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isSpaces(ch: string): boolean {
  return ch === " " || ch === "\t";
}

/** Parse the attribute list of one `[tag key=value ...]` header line. */
function parseHeaderAttributes(
  body: string,
  tag: string,
  line: number,
): Record<string, GodotValue> {
  const attributes: Record<string, GodotValue> = {};
  let pos = 0;
  const fail: (message: string, detail: string) => never = (message, detail) => {
    throw new GodotTscnError(`${message} (line ${line})`, `${detail}:${tag}:line ${line}`);
  };
  const skipSpaces = (): void => {
    while (pos < body.length && isSpaces(body.charAt(pos))) pos += 1;
  };
  skipSpaces();
  while (pos < body.length) {
    const keyMatch = KEY_RE.exec(body.slice(pos));
    if (keyMatch === null) fail(`malformed attribute name in [${tag}]`, "bad-attribute-name");
    const key = keyMatch[0];
    pos += key.length;
    skipSpaces();
    if (body.charAt(pos) !== "=") {
      fail(`attribute "${key}" of [${tag}] has no value`, `attribute-without-value:${key}`);
    }
    pos += 1;
    const valueParser = new LiteralParser(body.slice(pos), line);
    const value = valueParser.parseValue();
    pos += valueParser.position();
    if (Object.hasOwn(attributes, key)) {
      fail(`duplicate attribute "${key}" in [${tag}]`, `duplicate-attribute:${key}`);
    }
    attributes[key] = value;
    skipSpaces();
  }
  return attributes;
}

/** Parse the `key = value` property lines of one known section. */
function parseProperties(
  lines: readonly string[],
  from: number,
  to: number,
  tag: string,
): Record<string, GodotValue> {
  const properties: Record<string, GodotValue> = {};
  for (let index = from; index < to; index += 1) {
    const line = lines[index];
    if (line === undefined) break;
    const trimmed = line.trim();
    if (trimmed.length === 0) continue;
    const keyMatch = KEY_RE.exec(trimmed);
    const afterKey = keyMatch === null ? "" : trimmed.slice(keyMatch[0].length);
    if (keyMatch === null || !/^\s*=/.test(afterKey)) {
      throw new GodotTscnError(
        `[${tag}] line ${index + 1} is not a "key = value" property: ${JSON.stringify(line)}`,
        `malformed-property:${tag}:line ${index + 1}`,
      );
    }
    const key = keyMatch[0];
    const valueText = afterKey.replace(/^\s*=\s*/, "");
    if (Object.hasOwn(properties, key)) {
      throw new GodotTscnError(
        `duplicate property "${key}" in [${tag}] (line ${index + 1})`,
        `duplicate-property:${key}:line ${index + 1}`,
      );
    }
    properties[key] = parseGodotLiteral(valueText, index + 1);
  }
  return properties;
}

/** Read one `[tag body]` line, refusing anything after the closing ']'. */
function readSectionHeaderLine(
  line: string,
  lineNumber: number,
): { tag: string; body: string } {
  const close = line.indexOf("]");
  if (close === -1) {
    throw new GodotTscnError(
      `section header on line ${lineNumber} is never closed: ${JSON.stringify(line)}`,
      `unterminated-section:line ${lineNumber}`,
    );
  }
  if (line.slice(close + 1).trim() !== "") {
    throw new GodotTscnError(
      `content after ']' on line ${lineNumber}: ${JSON.stringify(line)}`,
      `content-after-section:line ${lineNumber}`,
    );
  }
  const inner = line.slice(1, close);
  const tagMatch = /^[A-Za-z_][A-Za-z0-9_]*/.exec(inner);
  if (tagMatch === null) {
    throw new GodotTscnError(
      `malformed section tag on line ${lineNumber}: ${JSON.stringify(line)}`,
      `malformed-section-tag:line ${lineNumber}`,
    );
  }
  return { tag: tagMatch[0], body: inner.slice(tagMatch[0].length) };
}

/** Find the line index of the next section header at or after `from`. */
function nextSectionLine(lines: readonly string[], from: number): number {
  let next = from;
  while (next < lines.length) {
    const upcoming = lines[next];
    if (upcoming === undefined || upcoming.trim().startsWith("[")) break;
    next += 1;
  }
  return next;
}

/** Parse a real .tscn text scene into the canonical state. */
export function parseGodotTscn(source: string): GodotTscnState {
  const text = source.charCodeAt(0) === 0xfeff ? source.slice(1) : source;
  const lines = text.split(/\r?\n/);
  let cursor = 0;
  while (cursor < lines.length && lines[cursor]?.trim() === "") cursor += 1;
  if (cursor >= lines.length) {
    throw new GodotTscnError("the document is empty: not a .tscn text scene", "empty-document");
  }
  const first = lines[cursor]?.trim() ?? "";
  if (!first.startsWith("[")) {
    throw new GodotTscnError(
      `line ${cursor + 1} does not start a section: not a .tscn text scene`,
      `not-tscn:line ${cursor + 1}`,
    );
  }
  const firstHeader = readSectionHeaderLine(first, cursor + 1);
  if (firstHeader.tag !== "gd_scene") {
    throw new GodotTscnError(
      `first section is [${firstHeader.tag}], not [gd_scene]: not a Godot text scene`,
      `first-section:${firstHeader.tag}`,
    );
  }
  const header: GodotSceneHeader = {
    kind: "header",
    attributes: parseHeaderAttributes(firstHeader.body, "gd_scene", cursor + 1),
  };
  const sections: GodotSceneSection[] = [];
  cursor += 1;
  while (cursor < lines.length) {
    const line = lines[cursor];
    if (line === undefined) break;
    const trimmed = line.trim();
    if (trimmed.length === 0) {
      cursor += 1;
      continue;
    }
    if (!trimmed.startsWith("[")) {
      throw new GodotTscnError(
        `line ${cursor + 1} is outside any section: ${JSON.stringify(line)}`,
        `content-outside-section:line ${cursor + 1}`,
      );
    }
    const headerLine = readSectionHeaderLine(trimmed, cursor + 1);
    const tag = headerLine.tag;
    const next = nextSectionLine(lines, cursor + 1);
    const attributes = parseHeaderAttributes(headerLine.body, tag, cursor + 1);
    if (tag === "ext_resource") {
      if (hasContentBetween(lines, cursor + 1, next)) {
        throw new GodotTscnError(
          `[ext_resource] carries property lines (line ${cursor + 1}) — the format does not allow that`,
          `ext-resource-properties:line ${cursor + 1}`,
        );
      }
      sections.push({ kind: "extResource", attributes });
    } else if (tag === "sub_resource") {
      sections.push({
        kind: "subResource",
        attributes,
        properties: parseProperties(lines, cursor + 1, next, tag),
      });
    } else if (tag === "node") {
      const nameValue = attributes.name;
      const parentValue = attributes.parent;
      const typeValue = attributes.type;
      if (nameValue?.kind !== "string") {
        throw new GodotTscnError(
          `[node] at line ${cursor + 1} has no string name attribute`,
          `node-without-name:line ${cursor + 1}`,
        );
      }
      if (parentValue !== undefined && parentValue.kind !== "string") {
        throw new GodotTscnError(
          `[node] at line ${cursor + 1} has a non-string parent attribute`,
          `node-parent-not-string:line ${cursor + 1}`,
        );
      }
      if (typeValue !== undefined && typeValue.kind !== "string") {
        throw new GodotTscnError(
          `[node] at line ${cursor + 1} has a non-string type attribute`,
          `node-type-not-string:line ${cursor + 1}`,
        );
      }
      const rest: Record<string, GodotValue> = {};
      for (const [key, value] of Object.entries(attributes)) {
        if (key !== "name" && key !== "parent" && key !== "type") rest[key] = value;
      }
      sections.push({
        kind: "node",
        name: nameValue.value,
        ...(typeValue === undefined ? {} : { nodeType: typeValue.value }),
        ...(parentValue === undefined ? {} : { parent: parentValue.value }),
        attributes: rest,
        properties: parseProperties(lines, cursor + 1, next, tag),
      });
    } else {
      const rawLines = lines.slice(cursor, next);
      while (rawLines.length > 0 && rawLines[rawLines.length - 1]?.trim() === "") {
        rawLines.pop();
      }
      sections.push({ kind: "opaque", raw: rawLines.join("\n") });
    }
    cursor = next;
  }
  return { tscn: { header, sections } };
}

function hasContentBetween(lines: readonly string[], from: number, to: number): boolean {
  for (let index = from; index < to; index += 1) {
    if ((lines[index] ?? "").trim().length > 0) return true;
  }
  return false;
}

/** Serialize a canonical .tscn state back to canonical text. */
export function serializeGodotTscn(state: GodotTscnState): string {
  if (!isPlainObject(state) || !isPlainObject(state.tscn) || !isPlainObject(state.tscn.header)) {
    throw new GodotTscnError(
      "serializeGodotTscn: state is not a .tscn scene state (missing tscn.header)",
      "not-tscn-state",
    );
  }
  const header = state.tscn.header as GodotSceneHeader;
  const sections = state.tscn.sections;
  if (!Array.isArray(sections)) {
    throw new GodotTscnError("serializeGodotTscn: tscn.sections is not an array", "not-tscn-state");
  }
  const blocks: string[] = [];
  blocks.push(`[gd_scene${renderAttributes(header.attributes)}]`);
  for (const section of sections as readonly GodotSceneSection[]) {
    switch (section.kind) {
      case "extResource":
        blocks.push(`[ext_resource${renderAttributes(section.attributes)}]`);
        break;
      case "subResource":
        blocks.push(sectionBlock("sub_resource", section.attributes, section.properties));
        break;
      case "node": {
        const attributes: Record<string, GodotValue> = {
          name: { kind: "string", value: section.name },
        };
        if (section.nodeType !== undefined) {
          attributes.type = { kind: "string", value: section.nodeType };
        }
        if (section.parent !== undefined) {
          attributes.parent = { kind: "string", value: section.parent };
        }
        for (const [key, value] of Object.entries(section.attributes ?? {})) {
          attributes[key] = value as GodotValue;
        }
        blocks.push(sectionBlock("node", attributes, section.properties));
        break;
      }
      case "opaque":
        blocks.push(section.raw);
        break;
    }
  }
  return `${blocks.join("\n\n")}\n`;
}

function sectionBlock(
  tag: string,
  attributes: Readonly<Record<string, GodotValue>>,
  properties: Readonly<Record<string, GodotValue>>,
): string {
  const headerLine = `[${tag}${renderAttributes(attributes)}]`;
  const propertyLines = Object.entries(properties).map(
    ([key, value]) => `${key} = ${serializeGodotValue(value)}`,
  );
  return propertyLines.length === 0
    ? headerLine
    : `${headerLine}\n${propertyLines.join("\n")}`;
}

function renderAttributes(attributes: Readonly<Record<string, GodotValue>>): string {
  let out = "";
  for (const [key, value] of Object.entries(attributes)) {
    out += ` ${key}=${serializeGodotValue(value)}`;
  }
  return out;
}
