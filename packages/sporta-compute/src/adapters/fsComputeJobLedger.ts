/**
 * FsComputeJobLedger — durable filesystem persistence for the compute
 * broker's job ledger (adapters layer), following the
 * FsSharedSessionStore pattern (sporta-editors W6) / the W2
 * FsArtifactBlobStore pattern.
 *
 * Public layout (documented, stable): one pretty-printed JSON file
 * per job at `rootDir/<sha256(jobId)[0:2]>/<sha256(jobId)>.json`
 * (default root: <os tmpdir>/sporta-compute-jobs) holding the
 * broker's own InternalJob shape on disk:
 *   { jobId, status: ComputeJobStatus, history: ComputeJobState[], submittedAt }.
 *
 * Writes are atomic (stage under rootDir/.tmp, rename into place) —
 * a reader never observes a torn file. Every read is
 * integrity-verified (parses; fields present and well-typed; the
 * jobId hashes back to the file's own address; the status is the
 * history's tip; a refusal is present exactly when the state is
 * refused) with a typed `ComputeLedgerError` — never silent
 * corruption. Durability is real: a fresh instance over the same
 * directory reads everything earlier instances wrote.
 */
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { Iso8601, SportaId } from "@sporta/contracts/contract";
import type { ComputeJobState, ComputeJobStatus, TypedRefusal } from "../domain/ports.js";

/** Any integrity violation of one job ledger file. */
export class ComputeLedgerError extends Error {
  /** The ledger file's path (when known). */
  readonly ledgerPath: string;
  /** Machine-readable reason for logs and tests. */
  readonly reason: string;

  constructor(message: string, ledgerPath: string, reason: string) {
    super(message);
    this.name = "ComputeLedgerError";
    this.ledgerPath = ledgerPath;
    this.reason = reason;
  }
}

/** The broker's InternalJob shape, on disk. */
export interface ComputeJobLedgerRecord {
  readonly jobId: SportaId;
  readonly status: ComputeJobStatus;
  readonly history: readonly ComputeJobState[];
  readonly submittedAt: Iso8601;
}

/** Injectable hash for ledger addressing (sha-256 by default). */
export type ComputeLedgerHashFn = (input: string) => string;

/** sha-256 helper for ledger addressing (node:crypto, adapters layer only). */
export function sha256ComputeLedgerHash(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

const JOB_STATES: readonly string[] = [
  "queued",
  "running",
  "succeeded",
  "failed",
  "refused",
  "cancelled",
];
const REFUSAL_KINDS: readonly string[] = [
  "provider-unavailable",
  "quota-exhausted",
  "credentials-missing",
  "policy-denied",
  "unsupported-operation",
];

/** Monotonic suffix so concurrent writes never share a temp path. */
let tempCounter = 0;

export class FsComputeJobLedger {
  private readonly rootDir: string;
  private readonly hash: ComputeLedgerHashFn;

  constructor(
    rootDir: string = join(tmpdir(), "sporta-compute-jobs"),
    hash: ComputeLedgerHashFn = sha256ComputeLedgerHash,
  ) {
    this.rootDir = rootDir;
    this.hash = hash;
  }

  /** Persist one job (atomic write: stage under .tmp, rename into place). */
  async saveJob(record: ComputeJobLedgerRecord): Promise<void> {
    const ledgerPath = this.pathFor(record.jobId);
    await fs.mkdir(dirname(ledgerPath), { recursive: true });
    const tempDir = join(this.rootDir, ".tmp");
    await fs.mkdir(tempDir, { recursive: true });
    tempCounter += 1;
    const tempPath = join(
      tempDir,
      `job-${this.idHashOf(ledgerPath)}-${process.pid}-${tempCounter}`,
    );
    try {
      await fs.writeFile(tempPath, `${JSON.stringify(record, null, 2)}\n`, "utf8");
      await fs.rename(tempPath, ledgerPath);
    } finally {
      await fs.rm(tempPath, { force: true }).catch(() => undefined);
    }
  }

  /** Read + integrity-verify one job's ledger; null when never persisted. */
  async readJob(jobId: SportaId): Promise<ComputeJobLedgerRecord | null> {
    const ledgerPath = this.pathFor(jobId);
    let raw: Buffer;
    try {
      raw = await fs.readFile(ledgerPath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
    return parseComputeJobLedger(raw.toString("utf8"), ledgerPath, this.idHashOf(ledgerPath));
  }

  /** Whether a ledger file exists for the job (presence only, no parse). */
  async hasJob(jobId: SportaId): Promise<boolean> {
    try {
      await fs.stat(this.pathFor(jobId));
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
      throw error;
    }
  }

  /** Ledger path for a job: `rootDir/<hash[0:2]>/<hash>.json`. */
  private pathFor(jobId: SportaId): string {
    const idHash = this.hash(jobId);
    return join(this.rootDir, idHash.substring(0, 2), `${idHash}.json`);
  }

  /** The id hash a ledger file is addressed by (file name minus .json). */
  private idHashOf(ledgerFile: string): string {
    return ledgerFile
      .split(/[\\/]/)
      .pop()!
      .replace(/\.json$/, "");
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isJobState(value: unknown): value is ComputeJobState {
  return typeof value === "string" && JOB_STATES.includes(value);
}

/**
 * Parse + integrity-verify one ledger file (fail-closed): parses,
 * required fields present and well-typed, the jobId hashes back to
 * the file's own address (id-address law), the history is non-empty
 * with its tip equal to the status state, and a refusal is present
 * exactly when the state is refused (the port law).
 */
export function parseComputeJobLedger(
  source: string,
  ledgerPath: string,
  expectedIdHash: string,
): ComputeJobLedgerRecord {
  const fail = (reason: string): never => {
    throw new ComputeLedgerError(
      `compute job ledger ${ledgerPath} failed integrity checks (${reason})`,
      ledgerPath,
      reason,
    );
  };
  let parsed: unknown;
  try {
    parsed = JSON.parse(source);
  } catch {
    return fail("not-json");
  }
  if (!isPlainObject(parsed)) return fail("not-an-object");
  if (!isNonEmptyString(parsed.jobId)) return fail("bad-jobId");
  if (sha256ComputeLedgerHash(parsed.jobId) !== expectedIdHash) {
    return fail("id-address-mismatch");
  }
  if (!isPlainObject(parsed.status)) return fail("bad-status");
  const status = parseStatus(parsed.status, parsed.jobId, fail);
  if (!Array.isArray(parsed.history) || parsed.history.length === 0) {
    return fail("bad-history");
  }
  const history: ComputeJobState[] = [];
  for (const entry of parsed.history) {
    if (!isJobState(entry)) return fail("bad-history-state");
    history.push(entry);
  }
  if (history[history.length - 1] !== status.state) return fail("history-tip-mismatch");
  if ((status.state === "refused") !== (status.refusal !== undefined)) {
    return fail("refusal-presence-mismatch");
  }
  if (!isNonEmptyString(parsed.submittedAt)) return fail("bad-submittedAt");
  return { jobId: parsed.jobId, status, history, submittedAt: parsed.submittedAt };
}

function parseStatus(
  candidate: Record<string, unknown>,
  jobId: SportaId,
  fail: (reason: string) => never,
): ComputeJobStatus {
  if (candidate.jobId !== jobId) return fail("status-jobId-mismatch");
  if (!isJobState(candidate.state)) return fail("bad-status-state");
  if (!isNonEmptyString(candidate.providerId)) return fail("bad-status-providerId");
  let refusal: TypedRefusal | undefined;
  if (candidate.refusal !== undefined) {
    if (!isPlainObject(candidate.refusal)) return fail("bad-refusal");
    if (
      typeof candidate.refusal.kind !== "string" ||
      !REFUSAL_KINDS.includes(candidate.refusal.kind)
    ) {
      return fail("bad-refusal-kind");
    }
    if (!isNonEmptyString(candidate.refusal.providerId)) return fail("bad-refusal-providerId");
    if (!isNonEmptyString(candidate.refusal.detail)) return fail("bad-refusal-detail");
    refusal = {
      kind: candidate.refusal.kind as TypedRefusal["kind"],
      providerId: candidate.refusal.providerId,
      detail: candidate.refusal.detail,
    };
  }
  const outputArtifactId =
    candidate.outputArtifactId === undefined || isNonEmptyString(candidate.outputArtifactId)
      ? candidate.outputArtifactId
      : fail("bad-outputArtifactId");
  const detail =
    candidate.detail === undefined || isNonEmptyString(candidate.detail)
      ? candidate.detail
      : fail("bad-detail");
  return {
    jobId,
    state: candidate.state,
    providerId: candidate.providerId,
    ...(refusal === undefined ? {} : { refusal }),
    ...(outputArtifactId === undefined ? {} : { outputArtifactId }),
    ...(detail === undefined ? {} : { detail }),
  };
}
