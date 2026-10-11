import { EditorError } from "../domain/errors.js";
/**
 * Godot text-scene literal machinery — adapters layer. NO external
 * libraries: a strict single-line recursive-descent parser for the Godot
 * Variant literal grammar used by .tscn/.tres property and attribute
 * values; every failure raises a typed GodotTscnError naming the 1-based
 * line. Numeric literals are carried VERBATIM as validated literal
 * strings — JS numbers corrupt int64 and exotic float forms, so the
 * lossless representation is the literal itself.
 */

/** Typed failure raised while parsing or emitting a Godot text scene. */
export class GodotTscnError extends EditorError {
  constructor(message: string, detail: string) {
    super(message, detail);
  }
}

/** One parsed Godot Variant literal (typed; unknown forms carried opaquely). */
export type GodotValue =
  | { readonly kind: "int"; readonly literal: string }
  | { readonly kind: "float"; readonly literal: string }
  | { readonly kind: "bool"; readonly value: boolean }
  | { readonly kind: "null" }
  | { readonly kind: "string"; readonly value: string }
  | { readonly kind: "vector2"; readonly x: string; readonly y: string }
  | { readonly kind: "nodePath"; readonly value: string }
  | { readonly kind: "extResource"; readonly id: string }
  | { readonly kind: "subResource"; readonly id: string }
  | { readonly kind: "array"; readonly items: readonly GodotValue[] }
  | {
      readonly kind: "dictionary";
      readonly entries: readonly { key: GodotValue; value: GodotValue }[];
    }
  | { readonly kind: "opaque"; readonly raw: string };

const INT_RE = /^[-+]?(?:0[xX][0-9a-fA-F_]+|\d[\d_]*)/;
const FLOAT_RE =
  /^[-+]?(?:(?:\d[\d_]*)?\.\d[\d_]*(?:[eE][-+]?\d+)?|\d[\d_]*[eE][-+]?\d+|inf|nan)/;
const IDENT_RE = /^[A-Za-z_][A-Za-z0-9_]*/;

/** Characters that may legally follow a complete atomic literal. */
const DELIMITERS = new Set([",", "]", "}", ")", ":"]);

function isSpaces(ch: string): boolean {
  return ch === " " || ch === "\t";
}

/** Parse one complete literal from `text` (single line, 1-based line no.). */
export function parseGodotLiteral(text: string, line: number): GodotValue {
  const parser = new LiteralParser(text, line);
  parser.skipSpaces();
  const value = parser.parseValue();
  parser.skipSpaces();
  if (!parser.eof()) {
    parser.fail("trailing characters after the value", "trailing-characters");
  }
  return value;
}

/** Escape a string into a Godot double-quoted literal body. */
function escapeGodotString(value: string): string {
  let out = "";
  for (const ch of value) {
    if (ch === "\\") out += "\\\\";
    else if (ch === '"') out += '\\"';
    else if (ch === "\n") out += "\\n";
    else if (ch === "\t") out += "\\t";
    else if (ch === "\r") out += "\\r";
    else if (ch === "\b") out += "\\b";
    else if (ch === "\f") out += "\\f";
    else if (ch < " ") {
      out += `\\u${ch.codePointAt(0)?.toString(16).padStart(4, "0")}`;
    } else out += ch;
  }
  return out;
}

/** Serialize one literal back to its canonical Godot text form. */
export function serializeGodotValue(value: GodotValue): string {
  switch (value.kind) {
    case "int":
    case "float":
      return value.literal;
    case "bool":
      return value.value ? "true" : "false";
    case "null":
      return "null";
    case "string":
      return `"${escapeGodotString(value.value)}"`;
    case "vector2":
      return `Vector2(${value.x}, ${value.y})`;
    case "nodePath":
      return `NodePath("${escapeGodotString(value.value)}")`;
    case "extResource":
      return `ExtResource("${escapeGodotString(value.id)}")`;
    case "subResource":
      return `SubResource("${escapeGodotString(value.id)}")`;
    case "array":
      return `[${value.items.map(serializeGodotValue).join(", ")}]`;
    case "dictionary":
      return `{${value.entries
        .map((entry) => `${serializeGodotValue(entry.key)}: ${serializeGodotValue(entry.value)}`)
        .join(", ")}}`;
    case "opaque":
      return value.raw;
  }
}

/**
 * The recursive-descent literal parser. Exposed so section-header parsing
 * can read a sequence of values off one line.
 */
export class LiteralParser {
  private pos = 0;

  constructor(
    private readonly source: string,
    private readonly line: number,
  ) {}

  fail(message: string, detail: string): never {
    throw new GodotTscnError(`${message} (line ${this.line})`, `${detail}:line ${this.line}`);
  }

  eof(): boolean {
    return this.pos >= this.source.length;
  }

  /** Current cursor (for callers parsing a sequence of values on one line). */
  position(): number {
    return this.pos;
  }

  peek(): string {
    return this.source.charAt(this.pos);
  }

  skipSpaces(): void {
    while (!this.eof() && isSpaces(this.peek())) this.pos += 1;
  }

  /** Parse one value at the cursor (does not require end-of-line). */
  parseValue(): GodotValue {
    this.skipSpaces();
    if (this.eof()) this.fail("expected a value, found end of line", "missing-value");
    const ch = this.peek();
    if (ch === '"') return { kind: "string", value: this.parseString() };
    if (ch === "[") return this.parseArray();
    if (ch === "{") return this.parseDictionary();
    const rest = this.source.slice(this.pos);
    const floatMatch = FLOAT_RE.exec(rest);
    if (floatMatch !== null) {
      return this.takeNumeric(floatMatch[0], "float");
    }
    const intMatch = INT_RE.exec(rest);
    if (intMatch !== null) {
      return this.takeNumeric(intMatch[0], "int");
    }
    const identMatch = IDENT_RE.exec(rest);
    if (identMatch !== null) {
      return this.parseIdentifier(identMatch[0]);
    }
    return { kind: "opaque", raw: this.takeOpaqueToken() };
  }

  /** Consume a matched numeric literal and enforce a legal delimiter. */
  private takeNumeric(literal: string, kind: "int" | "float"): GodotValue {
    this.pos += literal.length;
    if (!this.eof() && !isSpaces(this.peek()) && !DELIMITERS.has(this.peek())) {
      this.fail(
        `malformed number "${literal}${this.peek()}…"`,
        `malformed-number:${literal}${this.peek()}`,
      );
    }
    return kind === "int" ? { kind: "int", literal } : { kind: "float", literal };
  }

  private parseIdentifier(token: string): GodotValue {
    this.pos += token.length;
    let look = this.pos;
    while (look < this.source.length && isSpaces(this.source.charAt(look))) look += 1;
    const nextCh = look < this.source.length ? this.source.charAt(look) : "";
    if (nextCh !== "(") {
      if (token === "true") return { kind: "bool", value: true };
      if (token === "false") return { kind: "bool", value: false };
      if (token === "null") return { kind: "null" };
      return { kind: "opaque", raw: token };
    }
    if (token === "Vector2") return this.parseVector2();
    if (token === "NodePath") return { kind: "nodePath", value: this.parseOneStringRef(token) };
    if (token === "ExtResource") return { kind: "extResource", id: this.parseOneStringRef(token) };
    if (token === "SubResource") return { kind: "subResource", id: this.parseOneStringRef(token) };
    return { kind: "opaque", raw: this.takeBalancedCall(token) };
  }

  /** Parse `Vector2(<num>, <num>)` with verbatim numeric args. */
  private parseVector2(): GodotValue {
    this.expectOpenParen();
    const x = this.parseNumericArg("Vector2");
    this.expectComma();
    const y = this.parseNumericArg("Vector2");
    this.expectCloseParen();
    return { kind: "vector2", x, y };
  }

  private parseNumericArg(caller: string): string {
    this.skipSpaces();
    const rest = this.source.slice(this.pos);
    const floatMatch = FLOAT_RE.exec(rest);
    const intMatch = INT_RE.exec(rest);
    const match =
      floatMatch !== null && intMatch !== null
        ? floatMatch[0].length >= intMatch[0].length
          ? floatMatch[0]
          : intMatch[0]
        : (floatMatch ?? intMatch)?.[0];
    if (match === undefined) {
      this.fail(`${caller} argument is not a number`, "vector2-non-numeric");
    }
    this.pos += match.length;
    return match;
  }

  /** Parse `("…")` — the single string argument of the reference forms. */
  private parseOneStringRef(caller: string): string {
    this.expectOpenParen();
    this.skipSpaces();
    if (this.peek() !== '"') {
      this.fail(`${caller} argument is not a quoted string`, "reference-non-string");
    }
    const value = this.parseString();
    this.expectCloseParen();
    return value;
  }

  /** Capture an unmodeled constructor call verbatim (balanced parens). */
  private takeBalancedCall(head: string): string {
    const start = this.pos - head.length;
    let depth = 0;
    while (!this.eof()) {
      const ch = this.peek();
      if (ch === '"') {
        this.parseString();
        continue;
      }
      this.pos += 1;
      if (ch === "(") depth += 1;
      else if (ch === ")") {
        depth -= 1;
        if (depth === 0) return this.source.slice(start, this.pos);
      }
    }
    this.fail("unbalanced parentheses in value", "unbalanced-parens");
  }

  /** Capture an unmodeled bare token verbatim. */
  private takeOpaqueToken(): string {
    const start = this.pos;
    while (!this.eof() && !isSpaces(this.peek()) && !DELIMITERS.has(this.peek())) {
      this.pos += 1;
    }
    return this.source.slice(start, this.pos);
  }

  parseString(): string {
    if (this.peek() !== '"') {
      this.fail("expected a double-quoted string", "expected-string");
    }
    this.pos += 1;
    let out = "";
    for (;;) {
      if (this.eof()) this.fail("unterminated string literal", "unterminated-string");
      const ch = this.peek();
      this.pos += 1;
      if (ch === '"') return out;
      if (ch !== "\\") {
        out += ch;
        continue;
      }
      if (this.eof()) this.fail("unterminated escape sequence", "unterminated-string");
      const esc = this.peek();
      this.pos += 1;
      if (esc === "n") out += "\n";
      else if (esc === "t") out += "\t";
      else if (esc === "r") out += "\r";
      else if (esc === "b") out += "\b";
      else if (esc === "f") out += "\f";
      else if (esc === "\\") out += "\\";
      else if (esc === '"') out += '"';
      else if (esc === "'") out += "'";
      else if (esc === "u") {
        const hex = this.source.slice(this.pos, this.pos + 4);
        if (!/^[0-9a-fA-F]{4}$/.test(hex)) {
          this.fail(`malformed \\u escape "\\u${hex}"`, "malformed-escape");
        }
        out += String.fromCodePoint(Number.parseInt(hex, 16));
        this.pos += 4;
      } else {
        this.fail(`unknown escape sequence "\\${esc}"`, "unknown-escape");
      }
    }
  }

  private parseArray(): GodotValue {
    this.pos += 1; // consume '['
    const items: GodotValue[] = [];
    this.skipSpaces();
    if (this.peek() === "]") {
      this.pos += 1;
      return { kind: "array", items };
    }
    for (;;) {
      items.push(this.parseValue());
      this.skipSpaces();
      if (this.peek() === ",") {
        this.pos += 1;
        this.skipSpaces();
        continue;
      }
      if (this.peek() === "]") {
        this.pos += 1;
        return { kind: "array", items };
      }
      this.fail("expected ',' or ']' inside the array", "malformed-array");
    }
  }

  private parseDictionary(): GodotValue {
    this.pos += 1; // consume '{'
    const entries: { key: GodotValue; value: GodotValue }[] = [];
    this.skipSpaces();
    if (this.peek() === "}") {
      this.pos += 1;
      return { kind: "dictionary", entries };
    }
    for (;;) {
      const key = this.parseValue();
      this.skipSpaces();
      if (this.peek() !== ":") this.fail("expected ':' after the dictionary key", "malformed-dictionary");
      this.pos += 1;
      const value = this.parseValue();
      entries.push({ key, value });
      this.skipSpaces();
      if (this.peek() === ",") {
        this.pos += 1;
        this.skipSpaces();
        continue;
      }
      if (this.peek() === "}") {
        this.pos += 1;
        return { kind: "dictionary", entries };
      }
      this.fail("expected ',' or '}' inside the dictionary", "malformed-dictionary");
    }
  }

  private expectOpenParen(): void {
    this.skipSpaces();
    if (this.peek() !== "(") this.fail("expected '('", "expected-paren");
    this.pos += 1;
  }

  private expectCloseParen(): void {
    this.skipSpaces();
    if (this.peek() !== ")") this.fail("expected ')'", "expected-paren");
    this.pos += 1;
  }

  private expectComma(): void {
    this.skipSpaces();
    if (this.peek() !== ",") this.fail("expected ','", "expected-comma");
    this.pos += 1;
  }
}
