import type { EditOperation } from "../domain/operations.js";
import type { EditorAdapterPort, EditorHashFn } from "../domain/ports.js";
import {
  KdenliveXmlError,
  parseXml,
  serializeXmlAttributes,
  escapeXmlText,
  escapeXmlAttribute,
  type XmlElement,
} from "./kdenliveXml.js";
/**
 * Real Kdenlive editor adapter — round-trip import/export for the MLT XML
 * document shape used by .kdenlive project files (adapters layer).
 *
 * Honest understanding model: the adapter fully understands <mlt> root
 * attributes, the <profile> element, <producer>/<playlist>/<tractor>
 * containers with their <property>, <entry> and <track> children, and the
 * five predefined XML entities plus numeric character references. Anything
 * else (e.g. <blank> or <transition>) is carried through VERBATIM as raw
 * source markup and re-emitted byte-identically on export — nothing is
 * guessed and nothing is silently dropped. Order among entry/track/raw
 * children is preserved (timeline order matters); the relative order of
 * element kinds at the root is normalized (profile, producers, playlists,
 * tractors, unknown) which is semantically inert in MLT (references are
 * by id).
 */

/** A child element the adapter does not understand, preserved verbatim. */
export interface KdenliveRawElement {
  readonly type: "unknown";
  readonly tag: string;
  /** Exact source markup of the element, from '<' to its closing '>'. */
  readonly raw: string;
}

/** A playlist <entry producer="..." in="..." out="..."/> child. */
export interface KdenliveEntry {
  readonly type: "entry";
  readonly attributes: Readonly<Record<string, string>>;
}

/** A tractor <track producer="..." hide="..."/> child. */
export interface KdenliveTrack {
  readonly type: "track";
  readonly attributes: Readonly<Record<string, string>>;
}

/** <producer> element: attributes plus <property name="...">text pairs. */
export interface KdenliveProducer {
  readonly attributes: Readonly<Record<string, string>>;
  readonly properties: Readonly<Record<string, string>>;
  readonly unknown: readonly KdenliveRawElement[];
}

/** <playlist> element: attributes, properties, ordered children. */
export interface KdenlivePlaylist {
  readonly attributes: Readonly<Record<string, string>>;
  readonly properties: Readonly<Record<string, string>>;
  /** Document order of entries/blanks/… is preserved (timeline order). */
  readonly children: readonly (KdenliveEntry | KdenliveRawElement)[];
}

/** <tractor> element: attributes, properties, ordered track children. */
export interface KdenliveTractor {
  readonly attributes: Readonly<Record<string, string>>;
  readonly properties: Readonly<Record<string, string>>;
  readonly children: readonly (KdenliveTrack | KdenliveRawElement)[];
}

/** The <mlt> root element of a kdenlive project document. */
export interface KdenliveMlt {
  readonly attributes: Readonly<Record<string, string>>;
  readonly profile?: Readonly<Record<string, string>>;
  readonly producers: readonly KdenliveProducer[];
  readonly playlists: readonly KdenlivePlaylist[];
  readonly tractors: readonly KdenliveTractor[];
  readonly unknown: readonly KdenliveRawElement[];
}

/** Canonical parsed state of one .kdenlive (MLT) document. */
export interface KdenliveProjectState {
  readonly mlt: KdenliveMlt;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sortedEntries(projectState: object): [string, unknown][] {
  return Object.entries(projectState).sort(([left], [right]) =>
    left < right ? -1 : left > right ? 1 : 0,
  );
}

function rawOf(source: string, element: XmlElement): KdenliveRawElement {
  return { type: "unknown", tag: element.tag, raw: source.slice(element.start, element.end) };
}

/** Childless, whitespace-free content check for attribute-only elements. */
function isHollow(element: XmlElement): boolean {
  return element.children.length === 0 && element.text.trim() === "";
}

/** Property name of a simple <property name="...">text</property>, else null. */
function propertyName(child: XmlElement): string | null {
  if (child.tag !== "property" || child.children.length > 0) return null;
  const name = child.attributes.name;
  return name === undefined ? null : name;
}

/** Add one property to the map (typed duplicate check); false if not one. */
function addProperty(
  properties: Record<string, string>,
  child: XmlElement,
  containerTag: string,
): boolean {
  const name = propertyName(child);
  if (name === null) return false;
  if (Object.hasOwn(properties, name)) {
    throw new KdenliveXmlError(
      `duplicate property "${name}" in <${containerTag}>`,
      `duplicate-property:${name}`,
    );
  }
  properties[name] = child.text;
  return true;
}

function mapProducer(source: string, element: XmlElement): KdenliveProducer {
  const properties: Record<string, string> = {};
  const unknown: KdenliveRawElement[] = [];
  for (const child of element.children) {
    if (addProperty(properties, child, element.tag)) continue;
    unknown.push(rawOf(source, child));
  }
  return { attributes: { ...element.attributes }, properties, unknown };
}

function mapPlaylist(source: string, element: XmlElement): KdenlivePlaylist {
  const properties: Record<string, string> = {};
  const children: (KdenliveEntry | KdenliveRawElement)[] = [];
  for (const child of element.children) {
    if (addProperty(properties, child, element.tag)) continue;
    if (child.tag === "entry" && isHollow(child)) {
      children.push({ type: "entry", attributes: { ...child.attributes } });
    } else {
      children.push(rawOf(source, child));
    }
  }
  return { attributes: { ...element.attributes }, properties, children };
}

function mapTractor(source: string, element: XmlElement): KdenliveTractor {
  const properties: Record<string, string> = {};
  const children: (KdenliveTrack | KdenliveRawElement)[] = [];
  for (const child of element.children) {
    if (addProperty(properties, child, element.tag)) continue;
    if (child.tag === "track" && isHollow(child)) {
      children.push({ type: "track", attributes: { ...child.attributes } });
    } else {
      children.push(rawOf(source, child));
    }
  }
  return { attributes: { ...element.attributes }, properties, children };
}

export class KdenliveAdapter implements EditorAdapterPort {
  readonly editorId = "kdenlive";
  readonly editorVersion = "24.08.0";
  readonly integrationLevel: 1 | 2 | 3 = 2;
  readonly licensing = "GPL-3.0";
  readonly knownProjectFormats: readonly string[] = ["kdenlive"];

  constructor(private readonly hash: EditorHashFn) {}

  /**
   * Derive typed set operations from a changed project state. Kdenlive
   * (MLT-shaped) states get granular per-element paths; any other object
   * state falls back to honest top-level carry (mirrors the fixture
   * adapter). Non-objects derive nothing.
   */
  deriveOperations(projectState: unknown): readonly EditOperation[] {
    if (!isPlainObject(projectState)) return [];
    const operations: EditOperation[] = [];
    if (isPlainObject(projectState.mlt)) {
      operations.push(...this.mltOperations(projectState.mlt));
    }
    for (const [key, value] of sortedEntries(projectState)) {
      if (key === "mlt") continue;
      operations.push({
        kind: "set",
        path: `/${key}`,
        valueHash: this.hash(JSON.stringify(value)),
      });
    }
    return operations;
  }

  /** Parse a .kdenlive (MLT) XML document into the canonical state. */
  parseKdenliveXml(xml: string): KdenliveProjectState {
    const root = parseXml(xml);
    if (root.tag !== "mlt") {
      throw new KdenliveXmlError(
        `root element <${root.tag}> is not <mlt>: not a kdenlive/MLT document`,
        `root:${root.tag}`,
      );
    }
    const producers: KdenliveProducer[] = [];
    const playlists: KdenlivePlaylist[] = [];
    const tractors: KdenliveTractor[] = [];
    const unknown: KdenliveRawElement[] = [];
    let profile: Record<string, string> | undefined;
    for (const child of root.children) {
      if (child.tag === "profile" && profile === undefined && isHollow(child)) {
        profile = { ...child.attributes };
      } else if (child.tag === "producer") {
        producers.push(mapProducer(xml, child));
      } else if (child.tag === "playlist") {
        playlists.push(mapPlaylist(xml, child));
      } else if (child.tag === "tractor") {
        tractors.push(mapTractor(xml, child));
      } else {
        unknown.push(rawOf(xml, child));
      }
    }
    return {
      mlt: {
        attributes: { ...root.attributes },
        ...(profile === undefined ? {} : { profile }),
        producers,
        playlists,
        tractors,
        unknown,
      },
    };
  }

  /**
   * Export a canonical kdenlive project state to well-formed MLT XML.
   * Known parts are emitted canonically; unknown elements are re-emitted
   * with their raw source markup, byte-identically.
   */
  exportToKdenliveXml(state: KdenliveProjectState): string {
    if (!isPlainObject(state) || !isPlainObject(state.mlt)) {
      throw new KdenliveXmlError(
        "exportToKdenliveXml: state is not a kdenlive project state (missing mlt)",
        "not-kdenlive-state",
      );
    }
    const mlt = state.mlt as KdenliveMlt;
    const lines: string[] = ['<?xml version="1.0" encoding="utf-8"?>'];
    lines.push(`<mlt${serializeXmlAttributes(mlt.attributes)}>`);
    if (mlt.profile !== undefined) {
      lines.push(`  <profile${serializeXmlAttributes(mlt.profile)}/>`);
    }
    for (const producer of mlt.producers) {
      const properties = Object.entries(producer.properties);
      if (properties.length === 0 && producer.unknown.length === 0) {
        lines.push(`  <producer${serializeXmlAttributes(producer.attributes)}/>`);
        continue;
      }
      lines.push(`  <producer${serializeXmlAttributes(producer.attributes)}>`);
      lines.push(...this.propertyLines(properties));
      lines.push(...producer.unknown.map((element) => `    ${element.raw}`));
      lines.push("  </producer>");
    }
    for (const playlist of mlt.playlists) {
      const properties = Object.entries(playlist.properties);
      if (properties.length === 0 && playlist.children.length === 0) {
        lines.push(`  <playlist${serializeXmlAttributes(playlist.attributes)}/>`);
        continue;
      }
      lines.push(`  <playlist${serializeXmlAttributes(playlist.attributes)}>`);
      lines.push(...this.propertyLines(properties));
      for (const child of playlist.children) {
        lines.push(
          child.type === "entry"
            ? `    <entry${serializeXmlAttributes(child.attributes)}/>`
            : `    ${child.raw}`,
        );
      }
      lines.push("  </playlist>");
    }
    for (const tractor of mlt.tractors) {
      const properties = Object.entries(tractor.properties);
      if (properties.length === 0 && tractor.children.length === 0) {
        lines.push(`  <tractor${serializeXmlAttributes(tractor.attributes)}/>`);
        continue;
      }
      lines.push(`  <tractor${serializeXmlAttributes(tractor.attributes)}>`);
      lines.push(...this.propertyLines(properties));
      for (const child of tractor.children) {
        lines.push(
          child.type === "track"
            ? `    <track${serializeXmlAttributes(child.attributes)}/>`
            : `    ${child.raw}`,
        );
      }
      lines.push("  </tractor>");
    }
    for (const element of mlt.unknown) {
      lines.push(`  ${element.raw}`);
    }
    lines.push("</mlt>");
    return `${lines.join("\n")}\n`;
  }

  private propertyLines(properties: [string, string][]): string[] {
    return properties.map(
      ([name, value]) =>
        `    <property name="${escapeXmlAttribute(name)}">${escapeXmlText(value)}</property>`,
    );
  }

  private mltOperations(mlt: Record<string, unknown>): EditOperation[] {
    const operations: EditOperation[] = [];
    const set = (path: string, value: unknown): void => {
      operations.push({ kind: "set", path, valueHash: this.hash(JSON.stringify(value)) });
    };
    if (isPlainObject(mlt.attributes)) {
      for (const [key, value] of sortedEntries(mlt.attributes)) {
        set(`/mlt/attributes/${key}`, value);
      }
    }
    if (isPlainObject(mlt.profile)) {
      for (const [key, value] of sortedEntries(mlt.profile)) {
        set(`/mlt/profile/${key}`, value);
      }
    }
    const containers: [string, unknown][] = [
      ["producers", mlt.producers],
      ["playlists", mlt.playlists],
      ["tractors", mlt.tractors],
    ];
    for (const [name, records] of containers) {
      if (!Array.isArray(records)) continue;
      records.forEach((record, index) => {
        if (!isPlainObject(record)) return;
        set(`/mlt/${name}/${index}`, record);
        if (isPlainObject(record.properties)) {
          for (const [key, value] of sortedEntries(record.properties)) {
            set(`/mlt/${name}/${index}/properties/${key}`, value);
          }
        }
        if (Array.isArray(record.children)) {
          record.children.forEach((child, childIndex) => {
            set(`/mlt/${name}/${index}/children/${childIndex}`, child);
          });
        }
        if (Array.isArray(record.unknown)) {
          record.unknown.forEach((element, elementIndex) => {
            set(`/mlt/${name}/${index}/unknown/${elementIndex}`, element);
          });
        }
      });
    }
    if (Array.isArray(mlt.unknown)) {
      mlt.unknown.forEach((element, index) => {
        set(`/mlt/unknown/${index}`, element);
      });
    }
    return operations;
  }
}

export { KdenliveXmlError };
