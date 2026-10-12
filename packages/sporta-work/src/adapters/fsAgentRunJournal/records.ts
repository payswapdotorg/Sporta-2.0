/**
 * Agent-run journal record shapes + parse/serialize/verify (adapters
 * layer — pure transforms over already-read bytes; the FS journal
 * owns the IO).
 *
 * Journal file format (JSONL, one record per line):
 *   line 1: header record  — run metadata (the startRun facts);
 *   lines…: event records  — every observed AgentRunEvent in arrival
 *                            order.
 *
 * Verification is fail-closed: any missing field, wrong type, bad
 * enum, seq regression, id-address mismatch or unparseable line —
 * INCLUDING a torn trailing record from a crash mid-append — is a
 * typed `AgentRunJournalError`, never silent truncation.
 */
import { createHash } from "node:crypto";
import type { Iso8601, SportaId } from "@sporta/contracts/contract";
import type { AgentRunEvent } from "../../domain/ports.js";
import { AgentRunJournalError } from "./errors.js";

/** sha-256 helper for journal addressing (node:crypto, adapters layer only). */
export function sha256AgentRunHash(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

/** Run metadata — the durable facts of one started run. */
export interface AgentRunJournalMetadata {
  readonly runId: SportaId;
  readonly workGraphId: SportaId;
  readonly startedAt: Iso8601;
  readonly task: string;
  readonly organizationId: string;
  readonly organizationVersion: number;
}

/** Journal read-back: metadata + the full ordered event list. */
export interface AgentRunJournalContents {
  readonly metadata: AgentRunJournalMetadata;
  readonly events: readonly AgentRunEvent[];
}

/** Header record — always the journal's first line. */
interface HeaderRecord extends AgentRunJournalMetadata {
  readonly kind: "header";
  readonly formatVersion: number;
}

/** Event record — one observed AgentRunEvent. */
interface EventRecord {
  readonly kind: "event";
  readonly event: AgentRunEvent;
}

const FORMAT_VERSION = 1;
const EVENT_TYPES: readonly string[] = ["started", "progress", "completed", "failed"];

/** Serialize the header record (one JSONL line, trailing newline). */
export function serializeHeaderRecord(metadata: AgentRunJournalMetadata): string {
  const record: HeaderRecord = { kind: "header", formatVersion: FORMAT_VERSION, ...metadata };
  return `${JSON.stringify(record)}\n`;
}

/** Serialize one event record (one JSONL line, trailing newline). */
export function serializeEventRecord(event: AgentRunEvent): string {
  const record: EventRecord = { kind: "event", event };
  return `${JSON.stringify(record)}\n`;
}

/** Field-wise equality of two journal metadata records. */
export function agentRunMetadataEquals(
  a: AgentRunJournalMetadata,
  b: AgentRunJournalMetadata,
): boolean {
  return (
    a.runId === b.runId &&
    a.workGraphId === b.workGraphId &&
    a.startedAt === b.startedAt &&
    a.task === b.task &&
    a.organizationId === b.organizationId &&
    a.organizationVersion === b.organizationVersion
  );
}

/** Field-wise equality of two run events (divergence detection). */
export function agentRunEventsEqual(a: AgentRunEvent, b: AgentRunEvent): boolean {
  return (
    a.runId === b.runId &&
    a.seq === b.seq &&
    a.type === b.type &&
    a.detail === b.detail &&
    a.at === b.at
  );
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

/**
 * Parse + integrity-verify one whole journal file. `expectedIdHash`
 * is the sha-256 the file's own address carries; the header runId
 * must hash back to it (id-address law).
 */
export function parseAgentRunJournal(
  source: string,
  journalPath: string,
  expectedIdHash: string,
): AgentRunJournalContents {
  const fail = (line: number, reason: string): never => {
    throw new AgentRunJournalError(
      `agent-run journal ${journalPath} failed integrity checks at line ${line} (${reason})`,
      journalPath,
      `line:${line}:${reason}`,
    );
  };

  // One trailing newline is the normal file end; split leaves one
  // empty tail element for it. Any OTHER empty line is corruption.
  const rawLines = source.split("\n");
  if (rawLines.length > 0 && rawLines[rawLines.length - 1] === "") rawLines.pop();
  const lines = rawLines;
  if (lines.length === 0) return fail(0, "empty-journal");

  // Line 1: the header record.
  const header = parseHeaderLine(lines[0] ?? "", journalPath);
  if (sha256AgentRunHash(header.runId) !== expectedIdHash) {
    throw new AgentRunJournalError(
      `agent-run journal ${journalPath} failed integrity checks (runId does not hash back to the file's address)`,
      journalPath,
      "id-address-mismatch",
    );
  }

  // Lines 2..n: event records in arrival order, strictly increasing seq.
  const events: AgentRunEvent[] = [];
  let lastSeq = 0;
  for (let index = 1; index < lines.length; index += 1) {
    const lineNumber = index + 1;
    const line = lines[index] ?? "";
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      return fail(lineNumber, "corrupt-record");
    }
    if (!isPlainObject(parsed) || parsed.kind !== "event" || !isPlainObject(parsed.event)) {
      return fail(lineNumber, "not-an-event-record");
    }
    const event = parseEvent(parsed.event, header.runId, fail, lineNumber);
    if (event.seq <= lastSeq) {
      return fail(lineNumber, `seq-not-increasing:${event.seq}<=${lastSeq}`);
    }
    lastSeq = event.seq;
    events.push(event);
  }

  return { metadata: header, events };
}

/** Parse + verify the header line (journal line 1). */
export function parseHeaderLine(
  line: string,
  journalPath: string,
): AgentRunJournalMetadata {
  const fail = (reason: string): never => {
    throw new AgentRunJournalError(
      `agent-run journal ${journalPath} failed integrity checks at line 1 (${reason})`,
      journalPath,
      `line:1:${reason}`,
    );
  };
  let parsed: unknown;
  try {
    parsed = JSON.parse(line);
  } catch {
    return fail("corrupt-header");
  }
  if (!isPlainObject(parsed) || parsed.kind !== "header") return fail("not-a-header-record");
  if (parsed.formatVersion !== FORMAT_VERSION) return fail("unsupported-format-version");
  if (!isNonEmptyString(parsed.runId)) return fail("bad-runId");
  if (!isNonEmptyString(parsed.workGraphId)) return fail("bad-workGraphId");
  if (!isNonEmptyString(parsed.startedAt)) return fail("bad-startedAt");
  if (!isNonEmptyString(parsed.task)) return fail("bad-task");
  if (!isNonEmptyString(parsed.organizationId)) return fail("bad-organizationId");
  if (typeof parsed.organizationVersion !== "number" || !Number.isFinite(parsed.organizationVersion)) {
    return fail("bad-organizationVersion");
  }
  return {
    runId: parsed.runId,
    workGraphId: parsed.workGraphId,
    startedAt: parsed.startedAt,
    task: parsed.task,
    organizationId: parsed.organizationId,
    organizationVersion: parsed.organizationVersion,
  };
}

/** Parse + verify one embedded AgentRunEvent object. */
function parseEvent(
  candidate: Record<string, unknown>,
  headerRunId: SportaId,
  fail: (line: number, reason: string) => never,
  lineNumber: number,
): AgentRunEvent {
  if (!isNonEmptyString(candidate.runId)) return fail(lineNumber, "bad-event-runId");
  if (candidate.runId !== headerRunId) return fail(lineNumber, "event-runId-mismatch");
  if (typeof candidate.seq !== "number" || !Number.isInteger(candidate.seq) || candidate.seq <= 0) {
    return fail(lineNumber, "bad-event-seq");
  }
  if (typeof candidate.type !== "string" || !EVENT_TYPES.includes(candidate.type)) {
    return fail(lineNumber, "bad-event-type");
  }
  if (!isNonEmptyString(candidate.detail)) return fail(lineNumber, "bad-event-detail");
  if (!isNonEmptyString(candidate.at)) return fail(lineNumber, "bad-event-at");
  return {
    runId: candidate.runId,
    seq: candidate.seq,
    type: candidate.type as AgentRunEvent["type"],
    detail: candidate.detail,
    at: candidate.at,
  };
}
