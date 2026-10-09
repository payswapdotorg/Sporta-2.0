import { EditorError } from "../domain/errors.js";
/**
 * Minimal, honest XML machinery for the constrained kdenlive (MLT) document
 * shape — adapters layer. NO DOM APIs and NO external XML library: parsing
 * is a strict, index-based scan over the source string; well-formedness is
 * checked and every failure raises a typed KdenliveXmlError, never a guess.
 *
 * Supported: one root element; processing instructions (incl. the XML
 * declaration); DOCTYPE declarations (with or without an internal subset);
 * comments; CDATA; single- or double-quoted attributes; the five predefined
 * entities plus decimal/hex numeric character references.
 */

/** Typed failure raised while parsing or emitting kdenlive (MLT) XML. */
export class KdenliveXmlError extends EditorError {
  constructor(message: string, detail: string) {
    super(message, detail);
  }
}

/**
 * One parsed XML element. `text` is the concatenated, entity-decoded
 * character data; `start`/`end` are source offsets of the element's own
 * markup (used for verbatim carry-through of unknown elements).
 */
export interface XmlElement {
  readonly tag: string;
  readonly attributes: Readonly<Record<string, string>>;
  readonly children: readonly XmlElement[];
  readonly text: string;
  readonly start: number;
  readonly end: number;
}

const NAMED_ENTITIES: Readonly<Record<string, string>> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
};

function isNameStart(ch: string): boolean {
  return /[A-Za-z_]/.test(ch);
}

function isNameChar(ch: string): boolean {
  return /[A-Za-z0-9_.:-]/.test(ch);
}

/** Decode XML entities in character data or attribute values (strict). */
export function decodeXmlEntities(input: string): string {
  if (!input.includes("&")) return input;
  let out = "";
  let cursor = 0;
  for (;;) {
    const amp = input.indexOf("&", cursor);
    if (amp === -1) return out + input.slice(cursor);
    out += input.slice(cursor, amp);
    const semi = input.indexOf(";", amp);
    if (semi === -1) {
      throw new KdenliveXmlError(
        `malformed entity: "&" without ";" in "${input}"`,
        "unterminated-entity",
      );
    }
    const body = input.slice(amp + 1, semi);
    const named = NAMED_ENTITIES[body];
    if (named !== undefined) {
      out += named;
    } else if (body.startsWith("#")) {
      const hex = body.startsWith("#x") || body.startsWith("#X");
      const digits = body.slice(hex ? 2 : 1);
      const valid = hex ? /^[0-9a-fA-F]+$/.test(digits) : /^[0-9]+$/.test(digits);
      if (!valid) {
        throw new KdenliveXmlError(`malformed numeric entity "&${body};"`, body);
      }
      const code = Number.parseInt(digits, hex ? 16 : 10);
      if (!Number.isInteger(code) || code < 1 || code > 0x10ffff) {
        throw new KdenliveXmlError(`numeric entity "&${body};" is out of range`, body);
      }
      out += String.fromCodePoint(code);
    } else {
      throw new KdenliveXmlError(
        `unknown entity "&${body};" (only predefined entities are supported)`,
        body,
      );
    }
    cursor = semi + 1;
  }
}

/** Escape character data for XML emission. */
export function escapeXmlText(text: string): string {
  let out = "";
  for (const ch of text) {
    if (ch === "&") out += "&amp;";
    else if (ch === "<") out += "&lt;";
    else if (ch === ">") out += "&gt;";
    else out += ch;
  }
  return out;
}

/** Escape a double-quoted attribute value for XML emission. */
export function escapeXmlAttribute(value: string): string {
  let out = "";
  for (const ch of value) {
    if (ch === "&") out += "&amp;";
    else if (ch === "<") out += "&lt;";
    else if (ch === ">") out += "&gt;";
    else if (ch === '"') out += "&quot;";
    else if (ch === "\t") out += "&#9;";
    else if (ch === "\n") out += "&#10;";
    else if (ch === "\r") out += "&#13;";
    else out += ch;
  }
  return out;
}

/** Render an attribute map as ` name="value"` pairs in insertion order. */
export function serializeXmlAttributes(attributes: Readonly<Record<string, string>>): string {
  let out = "";
  for (const [name, value] of Object.entries(attributes)) {
    out += ` ${name}="${escapeXmlAttribute(value)}"`;
  }
  return out;
}

/**
 * Parse one XML document and return its root element. Malformed input
 * (unclosed or mismatched tags, duplicate attributes, unterminated
 * entities/CDATA/comments, content outside the root) raises
 * KdenliveXmlError.
 */
export function parseXml(source: string): XmlElement {
  // Tolerate a utf-8 BOM so real .kdenlive files saved by editors load.
  const text = source.charCodeAt(0) === 0xfeff ? source.slice(1) : source;
  const scanner = new Scanner(text);
  scanner.skipProlog();
  if (scanner.eof() || scanner.peek() !== "<") {
    scanner.fail("expected an XML root element");
  }
  const root = scanner.parseElement();
  scanner.skipTrailing();
  return root;
}

/** Index-based scanner — the single place that touches raw XML text. */
class Scanner {
  private pos = 0;

  constructor(private readonly source: string) {}

  fail(message: string, at: number = this.pos): never {
    throw new KdenliveXmlError(`${message} (at offset ${at})`, message);
  }

  eof(): boolean {
    return this.pos >= this.source.length;
  }

  peek(): string {
    return this.source.charAt(this.pos);
  }

  private skipWhitespace(): void {
    while (!this.eof() && /\s/.test(this.peek())) this.pos += 1;
  }

  /** Skip whitespace, PIs, comments and DOCTYPE before the root element. */
  skipProlog(): void {
    for (;;) {
      this.skipWhitespace();
      if (this.source.startsWith("<?", this.pos)) {
        const end = this.source.indexOf("?>", this.pos);
        if (end === -1) this.fail("unterminated processing instruction");
        this.pos = end + 2;
      } else if (this.source.startsWith("<!--", this.pos)) {
        this.skipComment();
      } else if (this.source.startsWith("<!", this.pos)) {
        this.skipDoctype();
      } else {
        return;
      }
    }
  }

  /** After the root element only whitespace and comments may follow. */
  skipTrailing(): void {
    for (;;) {
      this.skipWhitespace();
      if (this.eof()) return;
      if (this.source.startsWith("<!--", this.pos)) {
        this.skipComment();
        continue;
      }
      this.fail("content after the root element");
    }
  }

  private skipComment(): void {
    const end = this.source.indexOf("-->", this.pos);
    if (end === -1) this.fail("unterminated comment");
    this.pos = end + 3;
  }

  private skipDoctype(): void {
    // Handles an optional internal subset: <!DOCTYPE name [ ... ]>
    let cursor = this.pos;
    const close = this.source.indexOf(">", cursor);
    if (close === -1) this.fail("unterminated DOCTYPE declaration");
    const bracket = this.source.indexOf("[", cursor);
    if (bracket !== -1 && bracket < close) {
      const subsetEnd = this.source.indexOf("]", bracket);
      if (subsetEnd === -1) this.fail("unterminated DOCTYPE internal subset");
      const finalClose = this.source.indexOf(">", subsetEnd);
      if (finalClose === -1) this.fail("unterminated DOCTYPE declaration");
      cursor = finalClose;
    } else {
      cursor = close;
    }
    this.pos = cursor + 1;
  }

  private parseName(what: string): string {
    if (this.eof() || !isNameStart(this.peek())) this.fail(`expected a ${what} name`);
    const start = this.pos;
    this.pos += 1;
    while (!this.eof() && isNameChar(this.peek())) this.pos += 1;
    return this.source.slice(start, this.pos);
  }

  parseElement(): XmlElement {
    if (this.peek() !== "<") this.fail("expected '<' to open an element");
    const start = this.pos;
    this.pos += 1;
    const tag = this.parseName("element");
    const attributes: Record<string, string> = {};
    let selfClosing = false;
    for (;;) {
      this.skipWhitespace();
      if (this.eof()) this.fail(`unexpected end of document inside <${tag}>`);
      const ch = this.peek();
      if (ch === "/") {
        this.pos += 1;
        if (this.peek() !== ">") this.fail(`expected '>' after '/' in <${tag}>`);
        this.pos += 1;
        selfClosing = true;
        break;
      }
      if (ch === ">") {
        this.pos += 1;
        break;
      }
      const attribute = this.parseName("attribute");
      this.skipWhitespace();
      if (this.peek() !== "=") {
        this.fail(`attribute "${attribute}" of <${tag}> has no value`);
      }
      this.pos += 1;
      this.skipWhitespace();
      const quote = this.peek();
      if (quote !== '"' && quote !== "'") {
        this.fail(`attribute "${attribute}" of <${tag}> is not quoted`);
      }
      this.pos += 1;
      const valueEnd = this.source.indexOf(quote, this.pos);
      if (valueEnd === -1) {
        this.fail(`attribute "${attribute}" of <${tag}> has an unterminated value`);
      }
      if (Object.hasOwn(attributes, attribute)) {
        this.fail(`duplicate attribute "${attribute}" on <${tag}>`);
      }
      attributes[attribute] = decodeXmlEntities(this.source.slice(this.pos, valueEnd));
      this.pos = valueEnd + 1;
    }
    if (selfClosing) {
      return { tag, attributes, children: [], text: "", start, end: this.pos };
    }
    const children: XmlElement[] = [];
    let text = "";
    for (;;) {
      if (this.eof()) this.fail(`element <${tag}> is never closed`);
      if (this.source.startsWith("</", this.pos)) {
        this.pos += 2;
        const closeTag = this.parseName("closing element");
        this.skipWhitespace();
        if (this.peek() !== ">") this.fail(`malformed closing tag </${closeTag}>`);
        this.pos += 1;
        if (closeTag !== tag) {
          this.fail(`mismatched closing tag </${closeTag}> for <${tag}>`);
        }
        return { tag, attributes, children, text, start, end: this.pos };
      }
      if (this.source.startsWith("<!--", this.pos)) {
        this.skipComment();
        continue;
      }
      if (this.source.startsWith("<![CDATA[", this.pos)) {
        const end = this.source.indexOf("]]>", this.pos);
        if (end === -1) this.fail("unterminated CDATA section");
        text += this.source.slice(this.pos + 9, end);
        this.pos = end + 3;
        continue;
      }
      if (this.peek() === "<") {
        children.push(this.parseElement());
        continue;
      }
      const next = this.source.indexOf("<", this.pos);
      const stop = next === -1 ? this.source.length : next;
      text += decodeXmlEntities(this.source.slice(this.pos, stop));
      this.pos = stop;
    }
  }
}
