/**
 * The trusted component store (adapters layer). Components are
 * executable sources pinned by the sha256 digest of their exact
 * bytes; a node's `componentRef` resolves only when name, kind AND
 * digest all match, and the store re-verifies the stored source
 * hashes to its digest on EVERY execution (fail-closed on store
 * corruption). The built-in `json-event-stream-trim` v1 is the
 * first-slice REAL deterministic component.
 */
import type { ContentHash } from "@sporta/contracts/contract";
import type { TransformNodeKind } from "@sporta/transforms/contract";
import type {
  TransformComponentResolverPort,
  TransformHashPort,
} from "../domain/ports.js";

/** One executable component the store vouches for. */
export interface DeterministicComponent {
  /** Component name nodes pin by (unique in the store). */
  name: string;
  kind: "deterministic-filter" | "script";
  /** The exact executable source (a Node ESM script). */
  source: string;
}

/** A digest-verified component (digest = sha256 of source). */
export interface PinnedDeterministicComponent extends DeterministicComponent {
  digest: ContentHash;
}

/**
 * The trim component source. It runs as a REAL child process:
 *   node trim.mjs <input.ndjson> <output.ndjson> <summary.json> <startMs> <endMs>
 *
 * Laws (SPEC W9A-3): fail-closed on malformed input; kept lines are
 * copied VERBATIM (byte-exact identity/order/timestamps/uncertainty/
 * provenance); drops are counted; the summary carries the child's REAL
 * resourceUsage evidence. No network, no env reads, no host access.
 */
export const JSON_EVENT_STREAM_TRIM_SOURCE = `#!/usr/bin/env node
// json-event-stream-trim v1 — pinned deterministic component (P9-02).
import { readFileSync, writeFileSync } from "node:fs";
import { resourceUsage } from "node:process";

const args = process.argv.slice(2);
const fail = (code, payload) => {
  process.stderr.write(JSON.stringify(payload));
  process.exit(code);
};
if (args.length !== 5) {
  fail(2, { ok: false, error: "usage", expected: "trim <input> <output> <summary> <startMs> <endMs>" });
}
const [inputPath, outputPath, summaryPath, startRaw, endRaw] = args;
const startMs = Number(startRaw);
const endMs = Number(endRaw);
if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || startMs < 0 || endMs < 0 || startMs > endMs) {
  fail(3, { ok: false, error: "invalid-window", startMs: startRaw, endMs: endRaw });
}
let text;
try {
  text = readFileSync(inputPath, "utf8");
} catch (error) {
  fail(4, { ok: false, error: "unreadable-input", detail: String(error && error.message ? error.message : error) });
}
const lines = text.length === 0 ? [] : text.endsWith("\\n") ? text.slice(0, -1).split("\\n") : text.split("\\n");
const kept = [];
let dropped = 0;
for (const line of lines) {
  if (line.trim() === "") fail(5, { ok: false, error: "malformed-input", detail: "empty line in event stream" });
  let event;
  try {
    event = JSON.parse(line);
  } catch {
    fail(5, { ok: false, error: "malformed-input", detail: "line is not JSON" });
  }
  if (typeof event !== "object" || event === null) {
    fail(5, { ok: false, error: "malformed-input", detail: "event is not an object" });
  }
  if (typeof event.eventId !== "string" || event.eventId.length === 0) {
    fail(5, { ok: false, error: "malformed-input", detail: "eventId missing" });
  }
  if (typeof event.entityId !== "string" || event.entityId.length === 0) {
    fail(5, { ok: false, error: "malformed-input", detail: "entityId missing" });
  }
  if (typeof event.atMs !== "number" || !Number.isFinite(event.atMs)) {
    fail(5, { ok: false, error: "malformed-input", detail: "atMs missing or not finite" });
  }
  if (event.confidence !== undefined && (typeof event.confidence !== "number" || event.confidence < 0 || event.confidence > 1)) {
    fail(5, { ok: false, error: "malformed-input", detail: "confidence outside [0,1]" });
  }
  if (event.provenance !== undefined && (typeof event.provenance !== "object" || event.provenance === null)) {
    fail(5, { ok: false, error: "malformed-input", detail: "provenance is not an object" });
  }
  if (event.atMs >= startMs && event.atMs <= endMs) {
    kept.push(line);
  } else {
    dropped += 1;
  }
}
const out = kept.map((line) => line + "\\n").join("");
try {
  writeFileSync(outputPath, out, "utf8");
} catch (error) {
  fail(6, { ok: false, error: "unwritable-output", detail: String(error && error.message ? error.message : error) });
}
const usage = resourceUsage();
const summary = {
  component: "json-event-stream-trim",
  version: 1,
  ok: true,
  total: lines.length,
  kept: kept.length,
  dropped: dropped,
  inBytes: Buffer.byteLength(text, "utf8"),
  outBytes: Buffer.byteLength(out, "utf8"),
  cpuUserMs: Math.round(usage.userCPUTime / 1000),
  cpuSystemMs: Math.round(usage.systemCPUTime / 1000),
  maxRssKiB: usage.maxRSS,
};
try {
  writeFileSync(summaryPath, JSON.stringify(summary), "utf8");
} catch (error) {
  fail(7, { ok: false, error: "unwritable-summary", detail: String(error && error.message ? error.message : error) });
}
process.exitCode = 0;
`;

/** The built-in trim component pinned under the given hash adapter. */
export function jsonEventStreamTrimComponent(
  hash: TransformHashPort,
): PinnedDeterministicComponent {
  return {
    name: "json-event-stream-trim",
    kind: "deterministic-filter",
    source: JSON_EVENT_STREAM_TRIM_SOURCE,
    digest: hash.text(JSON_EVENT_STREAM_TRIM_SOURCE),
  };
}

/**
 * The trusted component store: resolves pinned references (plan-time
 * seam) and hands verified sources to the executor (run-time seam).
 * Digest integrity is re-verified on EVERY sourceOf call.
 */
export class DeterministicComponentStore implements TransformComponentResolverPort {
  private readonly hash: TransformHashPort;
  private readonly components = new Map<string, PinnedDeterministicComponent>();

  constructor(components: readonly DeterministicComponent[], hash: TransformHashPort) {
    this.hash = hash;
    for (const component of components) {
      const pinned: PinnedDeterministicComponent = {
        ...component,
        digest: hash.text(component.source),
      };
      this.components.set(component.name, pinned);
    }
  }

  /** Plan seam: resolve a pinned reference, or null (typed refusal upstream). */
  resolve(componentRef: {
    kind: TransformNodeKind;
    digest: string;
    name: string;
  }): { kind: "deterministic-filter" | "script"; name: string; digest: string } | null {
    const pinned = this.components.get(componentRef.name);
    if (pinned === undefined) return null;
    if (pinned.kind !== componentRef.kind) return null;
    if (pinned.digest !== componentRef.digest) return null;
    return { kind: pinned.kind, name: pinned.name, digest: pinned.digest };
  }

  /**
   * Run seam: the verified source for execution. Re-hashes the stored
   * source and refuses (null) on any store corruption — never executes
   * bytes that do not hash to their pinned digest.
   */
  sourceOf(name: string, digest: string): { source: string } | null {
    const pinned = this.components.get(name);
    if (pinned === undefined) return null;
    if (this.hash.text(pinned.source) !== pinned.digest) return null;
    if (pinned.digest !== digest) return null;
    return { source: pinned.source };
  }
}
