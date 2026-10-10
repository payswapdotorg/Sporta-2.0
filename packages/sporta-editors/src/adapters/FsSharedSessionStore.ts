import { promises as fs } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import type { SportaId } from "@sporta/contracts/contract";
import type { EditorHashFn } from "../domain/ports.js";
import { UnknownSharedSessionError } from "../domain/sharedSession/errors.js";
import type {
  SharedSessionCloseResult,
  SharedSessionStorePort,
} from "../domain/sharedSession/ports.js";
import type { SharedSessionCoordination } from "../domain/sharedSession/coordination.js";
import type { SharedSessionRecord } from "../domain/sharedSession/session.js";
import { sha256EditorHash } from "./hash.js";
import {
  parseSharedSessionLedger,
  serializeSharedSessionLedger,
  type SharedSessionLedger,
} from "./sharedSessionLedger.js";
/**
 * Durable filesystem-backed shared-session store (adapters layer) — a
 * REAL JSON ledger on real disk, following the W2 FsArtifactBlobStore
 * pattern.
 *
 * Layout: one pretty-printed JSON file per session at
 * `rootDir/<sha256(id)[0:2]>/<sha256(id)>.json` holding ALL of the
 * session's state ({session, coordination?, closeResult?}). Writes are
 * atomic (stage under `.tmp`, rename into place), so a reader never
 * observes a torn file. Every read is integrity-verified (parses,
 * required fields present and well-typed, the `sessionId` hashes back
 * to the file's own address) with typed `SharedSessionIntegrityError`
 * — never silent corruption. Durability is real: a fresh instance over
 * the same directory reads everything earlier instances wrote.
 */

/** Monotonic suffix so concurrent writes never share a temp path. */
let tempCounter = 0;

export class FsSharedSessionStore implements SharedSessionStorePort {
  private readonly rootDir: string;
  private readonly hash: EditorHashFn;

  constructor(
    rootDir: string = join(tmpdir(), "sporta-shared-sessions"),
    hash: EditorHashFn = sha256EditorHash,
  ) {
    this.rootDir = rootDir;
    this.hash = hash;
  }

  async saveSession(record: SharedSessionRecord): Promise<void> {
    const existing = await this.readLedger(record.sessionId);
    await this.writeLedger({
      ...(existing ?? { session: record }),
      session: record,
    });
  }

  async findSession(sessionId: SportaId): Promise<SharedSessionRecord | null> {
    return (await this.readLedger(sessionId))?.session ?? null;
  }

  async saveCoordination(coordination: SharedSessionCoordination): Promise<void> {
    const existing = await this.requireLedger(coordination.sessionId);
    await this.writeLedger({ ...existing, coordination });
  }

  async findCoordination(sessionId: SportaId): Promise<SharedSessionCoordination | null> {
    return (await this.readLedger(sessionId))?.coordination ?? null;
  }

  async saveCloseResult(sessionId: SportaId, result: SharedSessionCloseResult): Promise<void> {
    const existing = await this.requireLedger(sessionId);
    if (existing.closeResult !== undefined) return; // first write wins (memo)
    await this.writeLedger({ ...existing, closeResult: result });
  }

  async findCloseResult(sessionId: SportaId): Promise<SharedSessionCloseResult | null> {
    return (await this.readLedger(sessionId))?.closeResult ?? null;
  }

  /** Ledger path for a session id: `rootDir/<hash[0:2]>/<hash>.json`. */
  private pathFor(sessionId: SportaId): string {
    const idHash = this.hash(sessionId);
    return join(this.rootDir, idHash.substring(0, 2), `${idHash}.json`);
  }

  /** The id hash a ledger file is addressed by (its file name minus .json). */
  private idHashOf(ledgerFile: string): string {
    return ledgerFile
      .split(/[\\/]/)
      .pop()!
      .replace(/\.json$/, "");
  }

  /** Read + integrity-verify the ledger for a session; null when absent. */
  private async readLedger(sessionId: SportaId): Promise<SharedSessionLedger | null> {
    const recordPath = this.pathFor(sessionId);
    const raw = await this.readQuietly(recordPath);
    if (raw === null) return null;
    return parseSharedSessionLedger(
      raw.toString("utf8"),
      this.idHashOf(recordPath),
      recordPath,
      this.hash,
    );
  }

  /** Read the ledger or refuse typed (the session was never opened). */
  private async requireLedger(sessionId: SportaId): Promise<SharedSessionLedger> {
    const ledger = await this.readLedger(sessionId);
    if (ledger === null) {
      throw new UnknownSharedSessionError(
        `cannot write shared-session state for ${sessionId}: no ledger entry (the session was never opened)`,
        sessionId,
      );
    }
    return ledger;
  }

  /** Atomic ledger write: stage under `.tmp`, rename into place. */
  private async writeLedger(ledger: SharedSessionLedger): Promise<void> {
    const recordPath = this.pathFor(ledger.session.sessionId);
    await fs.mkdir(dirname(recordPath), { recursive: true });
    const tempDir = join(this.rootDir, ".tmp");
    await fs.mkdir(tempDir, { recursive: true });
    tempCounter += 1;
    const tempPath = join(
      tempDir,
      `ledger-${this.idHashOf(recordPath)}-${process.pid}-${tempCounter}`,
    );
    try {
      await fs.writeFile(tempPath, serializeSharedSessionLedger(ledger), "utf8");
      await fs.rename(tempPath, recordPath);
    } finally {
      await fs.rm(tempPath, { force: true }).catch(() => undefined);
    }
  }

  /** Read a ledger if present; null only for ENOENT, everything else rethrows. */
  private async readQuietly(recordPath: string): Promise<Buffer | null> {
    try {
      return await fs.readFile(recordPath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  }
}
