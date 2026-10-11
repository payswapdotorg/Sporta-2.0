import { EditorError } from "../domain/errors.js";
import {
  escapeXmlAttribute,
  escapeXmlText,
  parseXmlDocument,
  serializeXmlAttributes,
  type XmlElement,
} from "./editorXml.js";
/**
 * Minimal, honest machinery for the Audacity 2.x legacy project (.aup)
 * XML document shape — adapters layer. Parsing uses the shared strict
 * XML scanner; every failure raises a typed AudacityAupError naming the
 * failure point.
 *
 * Honest understanding model (SPEC "Wave 6 — round-trip expansions"):
 * the <project> root with ALL attributes preserved, the <tags> block,
 * <wavetrack> elements with <waveclip> -> <sequence> -> <waveblock>
 * chains carrying the REQUIRED start values and the external
 * alias/summary file references. The referenced sample data stays
 * external (an .aup without its sample blocks on disk is still a legal
 * document — the Kdenlive-MLT law; binary sample data is NEVER
 * fabricated). Anything else is carried as an opaque raw fragment and
 * re-emitted byte-identically.
 */

/** Typed failure raised while parsing or emitting an Audacity .aup document. */
export class AudacityAupError extends EditorError {
  constructor(message: string, detail: string) {
    super(message, detail);
  }
}

/** A child element the adapter does not understand, preserved verbatim. */
export interface AudacityRawElement {
  readonly type: "unknown";
  readonly tag: string;
  /** Exact source markup of the element, from '<' to its closing '>'. */
  readonly raw: string;
}

/** One <tag name="...">value</tag> pair inside the <tags> block. */
export interface AudacityTag {
  readonly name: string;
  readonly value: string;
}

/** The <tags> metadata block. */
export interface AudacityTagsBlock {
  readonly type: "tags";
  readonly tags: readonly AudacityTag[];
  readonly unknown: readonly AudacityRawElement[];
}

/** A modeled sample/alias file reference child of a waveblock. */
export interface AudacityBlockFile {
  readonly type: "simpleblockfile" | "aliasblockfile";
  /** All attributes verbatim (filename, len, min/max/rms, ...). */
  readonly attributes: Readonly<Record<string, string>>;
}

/** One <waveblock start="..."> in a sequence's block chain. */
export interface AudacityWaveblock {
  /** The block's sample-offset start (required in every real .aup). */
  readonly start: string;
  /** Remaining waveblock attributes, verbatim. */
  readonly attributes: Readonly<Record<string, string>>;
  /** The modeled file-reference child, when present. */
  readonly blockFile?: Readonly<AudacityBlockFile>;
  readonly unknown: readonly AudacityRawElement[];
}

/** The <sequence maxlen="..."> container of one waveclip. */
export interface AudacitySequence {
  readonly attributes: Readonly<Record<string, string>>;
  readonly waveblocks: readonly AudacityWaveblock[];
  readonly unknown: readonly AudacityRawElement[];
}

/** One <waveclip offset="..."> in a wavetrack. */
export interface AudacityWaveclip {
  readonly type: "waveclip";
  readonly attributes: Readonly<Record<string, string>>;
  readonly sequence?: Readonly<AudacitySequence>;
  readonly unknown: readonly AudacityRawElement[];
}

/** One <wavetrack name="..." channel="..." rate="..."> element. */
export interface AudacityWavetrack {
  readonly type: "wavetrack";
  readonly attributes: Readonly<Record<string, string>>;
  readonly children: readonly (AudacityWaveclip | AudacityRawElement)[];
}

export type AudacityProjectChild = AudacityTagsBlock | AudacityWavetrack | AudacityRawElement;

/** The <project> root of an Audacity 2.x project document. */
export interface AudacityProject {
  readonly type: "project";
  /** ALL root attributes, verbatim (projname, rate, snapto, ...). */
  readonly attributes: Readonly<Record<string, string>>;
  /** Document order of children is preserved (track order is semantic). */
  readonly children: readonly AudacityProjectChild[];
}

/** Canonical parsed state of one .aup project document. */
export interface AudacityProjectState {
  readonly project: AudacityProject;
}

function fail(message: string, detail: string): AudacityAupError {
  return new AudacityAupError(message, detail);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function rawOf(source: string, element: XmlElement): AudacityRawElement {
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

function refuseStrayText(element: XmlElement, container: string): void {
  if (element.text.trim() !== "") {
    throw fail(
      `stray character data inside <${container}> (at offset ${element.start})`,
      "stray-text",
    );
  }
}

function mapTagsBlock(source: string, element: XmlElement): AudacityTagsBlock {
  const tags: AudacityTag[] = [];
  const unknown: AudacityRawElement[] = [];
  for (const child of element.children) {
    if (child.tag === "tag" && child.children.length === 0 && child.attributes.name !== undefined) {
      tags.push({ name: child.attributes.name, value: child.text });
    } else {
      unknown.push(rawOf(source, child));
    }
  }
  return { type: "tags", tags, unknown };
}

function mapWaveblock(source: string, element: XmlElement): AudacityWaveblock {
  const start = element.attributes.start;
  if (start === undefined) {
    throw fail(
      `<waveblock> at offset ${element.start} has no "start" attribute — malformed .aup`,
      `waveblock-without-start:${element.start}`,
    );
  }
  const attributes = withoutKeys(element.attributes, ["start"]);
  let blockFile: AudacityBlockFile | undefined;
  const unknown: AudacityRawElement[] = [];
  for (const child of element.children) {
    if (
      (child.tag === "simpleblockfile" || child.tag === "aliasblockfile") &&
      isHollow(child) &&
      blockFile === undefined
    ) {
      blockFile = { type: child.tag, attributes: { ...child.attributes } };
    } else {
      unknown.push(rawOf(source, child));
    }
  }
  return blockFile === undefined
    ? { start, attributes, unknown }
    : { start, attributes, blockFile, unknown };
}

function mapSequence(source: string, element: XmlElement): AudacitySequence {
  const waveblocks: AudacityWaveblock[] = [];
  const unknown: AudacityRawElement[] = [];
  for (const child of element.children) {
    if (child.tag === "waveblock") {
      waveblocks.push(mapWaveblock(source, child));
    } else {
      unknown.push(rawOf(source, child));
    }
  }
  return { attributes: { ...element.attributes }, waveblocks, unknown };
}

function mapWaveclip(source: string, element: XmlElement): AudacityWaveclip {
  let sequence: AudacitySequence | undefined;
  const unknown: AudacityRawElement[] = [];
  for (const child of element.children) {
    if (child.tag === "sequence" && sequence === undefined) {
      sequence = mapSequence(source, child);
    } else {
      unknown.push(rawOf(source, child));
    }
  }
  return sequence === undefined
    ? { type: "waveclip", attributes: { ...element.attributes }, unknown }
    : { type: "waveclip", attributes: { ...element.attributes }, sequence, unknown };
}

function mapWavetrack(source: string, element: XmlElement): AudacityWavetrack {
  refuseStrayText(element, "wavetrack");
  const children: (AudacityWaveclip | AudacityRawElement)[] = [];
  for (const child of element.children) {
    if (child.tag === "waveclip") {
      children.push(mapWaveclip(source, child));
    } else {
      children.push(rawOf(source, child));
    }
  }
  return { type: "wavetrack", attributes: { ...element.attributes }, children };
}

/** Parse a real Audacity 2.x .aup document into the canonical state. */
export function parseAudacityAup(source: string): AudacityProjectState {
  const root = parseXmlDocument(source, fail);
  if (root.tag !== "project") {
    throw fail(
      `root element <${root.tag}> is not <project>: not an Audacity .aup document`,
      `root:${root.tag}`,
    );
  }
  refuseStrayText(root, "project");
  const children: AudacityProjectChild[] = root.children.map((child) => {
    if (child.tag === "tags") return mapTagsBlock(source, child);
    if (child.tag === "wavetrack") return mapWavetrack(source, child);
    return rawOf(source, child);
  });
  return {
    project: { type: "project", attributes: { ...root.attributes }, children },
  };
}

/** The wavetrack subset of a project's children, in document order. */
export function audacityWavetracksOf(project: AudacityProject): readonly AudacityWavetrack[] {
  return project.children.filter(
    (child): child is AudacityWavetrack => child.type === "wavetrack",
  );
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
 * Serialize a canonical Audacity project state to a well-formed .aup
 * document. Known parts are emitted canonically; unknown elements are
 * re-emitted with their raw source markup, byte-identically.
 */
export function serializeAudacityAup(state: AudacityProjectState): string {
  if (!isPlainObject(state) || !isPlainObject(state.project)) {
    throw fail(
      "serializeAudacityAup: state is not an Audacity project state (missing project)",
      "not-aup-state",
    );
  }
  const project = state.project as AudacityProject;
  if (!Array.isArray(project.children)) {
    throw fail("serializeAudacityAup: project.children is not an array", "not-aup-state");
  }
  const lines: string[] = ['<?xml version="1.0" encoding="utf-8"?>'];
  lines.push(`<project${serializeXmlAttributes(project.attributes)}>`);
  for (const child of project.children as readonly AudacityProjectChild[]) {
    if (child.type === "tags") {
      lines.push("  <tags>");
      for (const tag of child.tags) {
        lines.push(
          `    <tag name="${escapeXmlAttribute(tag.name)}">${escapeXmlText(tag.value)}</tag>`,
        );
      }
      lines.push(...child.unknown.map((element) => `    ${element.raw}`));
      lines.push("  </tags>");
    } else if (child.type === "wavetrack") {
      lines.push(`  <wavetrack${serializeXmlAttributes(child.attributes)}>`);
      for (const clip of child.children) {
        if (clip.type === "unknown") {
          lines.push(`    ${clip.raw}`);
          continue;
        }
        lines.push(`    <waveclip${serializeXmlAttributes(clip.attributes)}>`);
        if (clip.sequence !== undefined) {
          lines.push(`      <sequence${serializeXmlAttributes(clip.sequence.attributes)}>`);
          for (const block of clip.sequence.waveblocks) {
            guardRecord(block.attributes, ["start"], "waveblock");
            lines.push(
              `        <waveblock start="${escapeXmlAttribute(block.start)}"${serializeXmlAttributes(block.attributes)}>`,
            );
            if (block.blockFile !== undefined) {
              lines.push(
                `          <${block.blockFile.type}${serializeXmlAttributes(block.blockFile.attributes)}/>`,
              );
            }
            lines.push(...block.unknown.map((element) => `          ${element.raw}`));
            lines.push("        </waveblock>");
          }
          lines.push(...clip.sequence.unknown.map((element) => `      ${element.raw}`));
          lines.push("      </sequence>");
        }
        lines.push(...clip.unknown.map((element) => `    ${element.raw}`));
        lines.push("    </waveclip>");
      }
      lines.push("  </wavetrack>");
    } else {
      lines.push(`  ${child.raw}`);
    }
  }
  lines.push("</project>");
  return `${lines.join("\n")}\n`;
}
