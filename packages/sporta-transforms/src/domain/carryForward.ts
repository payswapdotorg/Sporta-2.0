/**
 * W9A-4 / P9-04 — semantic/event carry-forward verification (domain
 * layer — pure). Where a pipeline claims preservation (event/entity
 * identity, order, timestamps, uncertainty, provenance), the run
 * service re-verifies the claim IN PROCESS against the actual bytes:
 * kept events must be byte-exact copies in original order; drops must
 * be the only change. A failed verification is a typed failure —
 * hidden semantic drift is impossible by construction.
 *
 * First-slice event shape (the json-event-stream-trim component
 * contract): one NDJSON line per event, each event an object with
 * `eventId` (string), `entityId` (string), `atMs` (finite number),
 * optional `confidence` (number in [0,1]) and optional `provenance`
 * (object).
 */
import { stableEquals } from "./stable.js";

/** The carry-forward verification verdict (all fields typed facts). */
export interface EventStreamCarryForward {
  /** True exactly when every preservation claim held. */
  ok: boolean;
  /** How many input events were kept (present in the output). */
  keptCount: number;
  /** How many input events were dropped — explicit, counted. */
  droppedCount: number;
  /** Total input events. */
  totalIn: number;
  /** Kept output lines are byte-identical to input lines. */
  byteExact: boolean;
  /** Kept events appear in the original relative order. */
  orderPreserved: boolean;
  /** eventId/entityId of every kept event is unchanged. */
  identityPreserved: boolean;
  /** atMs of every kept event is unchanged. */
  timestampPreserved: boolean;
  /** confidence (uncertainty) of every kept event is unchanged. */
  uncertaintyPreserved: boolean;
  /** provenance object of every kept event is deep-equal unchanged. */
  provenancePreserved: boolean;
  /** Machine-readable typed detail for step records. */
  detail: string;
}

interface ParsedStream {
  events: Record<string, unknown>[];
  lines: string[];
}

function parseStream(bytes: Uint8Array): ParsedStream {
  const text = new TextDecoder().decode(bytes);
  const lines = text.split("\n").filter((line) => line.length > 0);
  const events: Record<string, unknown>[] = [];
  for (const line of lines) {
    const parsed: unknown = JSON.parse(line);
    events.push(parsed as Record<string, unknown>);
  }
  return { events, lines };
}

/**
 * Verify that `output` is exactly the subsequence of `input` the trim
 * claims: kept events byte-exact and in order, drops counted, no other
 * change. Malformed streams throw — fail-closed (the caller records
 * the typed failure, never a partial pass).
 */
export function verifyEventStreamCarryForward(
  inputBytes: Uint8Array,
  outputBytes: Uint8Array,
): EventStreamCarryForward {
  const input = parseStream(inputBytes);
  const output = parseStream(outputBytes);

  // Match each output line to the first unmatched identical input
  // line. byteExact = every output line matched; matched positions
  // strictly increasing = orderPreserved.
  const used = new Set<number>();
  const matches: { inputIndex: number; outputIndex: number }[] = [];
  let byteExact = true;
  for (let outIndex = 0; outIndex < output.lines.length; outIndex += 1) {
    const outLine = output.lines[outIndex];
    if (outLine === undefined) continue;
    let found = -1;
    for (let inIndex = 0; inIndex < input.lines.length; inIndex += 1) {
      if (used.has(inIndex)) continue;
      if (input.lines[inIndex] === outLine) {
        found = inIndex;
        break;
      }
    }
    if (found === -1) {
      byteExact = false;
      break;
    }
    used.add(found);
    matches.push({ inputIndex: found, outputIndex: outIndex });
  }
  const orderPreserved = matches.every(
    (match, index) => index === 0 || matches[index - 1]!.inputIndex < match.inputIndex,
  );

  // Semantic per-event checks over matched pairs.
  let identityPreserved = true;
  let timestampPreserved = true;
  let uncertaintyPreserved = true;
  let provenancePreserved = true;
  for (const match of matches) {
    const inEvent = input.events[match.inputIndex];
    const outEvent = output.events[match.outputIndex];
    if (inEvent === undefined || outEvent === undefined) {
      identityPreserved = false;
      continue;
    }
    if (inEvent.eventId !== outEvent.eventId || inEvent.entityId !== outEvent.entityId) {
      identityPreserved = false;
    }
    if (inEvent.atMs !== outEvent.atMs) timestampPreserved = false;
    if (!stableEquals(inEvent.confidence, outEvent.confidence)) uncertaintyPreserved = false;
    if (!stableEquals(inEvent.provenance, outEvent.provenance)) provenancePreserved = false;
  }

  const keptCount = matches.length;
  const droppedCount = Math.max(0, input.lines.length - output.lines.length);
  const ok =
    byteExact && orderPreserved && identityPreserved && timestampPreserved && uncertaintyPreserved && provenancePreserved;
  return {
    ok,
    keptCount,
    droppedCount,
    totalIn: input.lines.length,
    byteExact,
    orderPreserved,
    identityPreserved,
    timestampPreserved,
    uncertaintyPreserved,
    provenancePreserved,
    detail: ok
      ? `carry-forward verified: ${keptCount} kept byte-exact, ${droppedCount} dropped (of ${input.lines.length}), order/timestamps/uncertainty/provenance preserved`
      : `carry-forward FAILED: byteExact=${byteExact} order=${orderPreserved} identity=${identityPreserved} timestamps=${timestampPreserved} uncertainty=${uncertaintyPreserved} provenance=${provenancePreserved}`,
  };
}
