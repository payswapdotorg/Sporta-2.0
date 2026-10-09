import { promises as fs } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import type { EditorSessionRecord, Iso8601, SportaId } from "@sporta/contracts/contract";
import { EditorSessionHistoryIntegrityError, UnknownEditorSessionError } from "../domain/errors.js";
import {
  compareEditorSessionsNewestFirst,
  matchesEditorSessionHistoryFilter,
} from "../domain/history.js";
import type {
  EditorSessionHistoryFilter,
  EditorSessionHistoryStorePort,
} from "../domain/history.js";
import type { EditorHashFn } from "../domain/ports.js";
import { sha256EditorHash } from "./hash.js";
/**
 * Durable filesystem-backed editor session history store (adapters
 * layer) — a JSON ledger on real disk, following the W2
 * FsArtifactBlobStore pattern.
 *
 * Layout: one pretty-printed JSON record per session at
 * `rootDir/<sha256(id)[0:2]>/<sha256(id)>.json`. Writes are atomic
 * (stage under `.tmp`, rename into place), so a reader never observes a
 * torn record. Every ledger read is integrity-verified: the file must
 * parse, carry the required record fields, and its `editorSessionId`
 * must hash back to the file's own address — anything else is a typed
 * `EditorSessionHistoryIntegrityError`, never silent corruption.
 * Durability is real: a fresh instance over the same directory reads
 * everything earlier instances wrote.
 */

/** Monotonic suffix so concurrent writes never share a temp path. */
let tempCounter = 0;

const MODES: readonly string[] = ["local", "remote", "embedded", "external"];

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export class FsEditorSessionHistoryStore implements EditorSessionHistoryStorePort {
  private readonly rootDir: string;
  private readonly hash: EditorHashFn;

  constructor(
    rootDir: string = join(tmpdir(), "sporta-editor-history"),
    hash: EditorHashFn = sha256EditorHash,
  ) {
    this.rootDir = rootDir;
    this.hash = hash;
  }

  async append(record: EditorSessionRecord): Promise<void> {
    const recordPath = this.pathFor(record.editorSessionId);
    if ((await this.readQuietly(recordPath)) !== null) return; // first write wins
    await this.writeRecord(recordPath, record);
  }

  async close(editorSessionId: SportaId, closedAt: Iso8601): Promise<EditorSessionRecord> {
    const recordPath = this.pathFor(editorSessionId);
    const raw = await this.readQuietly(recordPath);
    if (raw === null) {
      throw new UnknownEditorSessionError(
        `cannot close unknown editor session ${editorSessionId} in the history ledger`,
        editorSessionId,
      );
    }
    const record = this.parseRecord(raw.toString("utf8"), this.idHashOf(recordPath), recordPath);
    if (record.closedAt !== undefined) return record; // first close wins
    const closed: EditorSessionRecord = { ...record, closedAt };
    await this.writeRecord(recordPath, closed);
    return closed;
  }

  async list(filter: EditorSessionHistoryFilter): Promise<readonly EditorSessionRecord[]> {
    const records: EditorSessionRecord[] = [];
    for (const ledgerFile of await this.ledgerFiles()) {
      const raw = await fs.readFile(ledgerFile);
      records.push(this.parseRecord(raw.toString("utf8"), this.idHashOf(ledgerFile), ledgerFile));
    }
    return records
      .filter((record) => matchesEditorSessionHistoryFilter(record, filter))
      .sort(compareEditorSessionsNewestFirst)
      .slice(0, filter.limit);
  }

  /** Ledger path for a session id: `rootDir/<hash[0:2]>/<hash>.json`. */
  private pathFor(editorSessionId: SportaId): string {
    const idHash = this.hash(editorSessionId);
    return join(this.rootDir, idHash.substring(0, 2), `${idHash}.json`);
  }

  /** The id hash a ledger file is addressed by (its file name minus .json). */
  private idHashOf(ledgerFile: string): string {
    return ledgerFile
      .split(/[\\/]/)
      .pop()!
      .replace(/\.json$/, "");
  }

  /** Atomic record write: stage under `.tmp`, rename into place. */
  private async writeRecord(recordPath: string, record: EditorSessionRecord): Promise<void> {
    await fs.mkdir(dirname(recordPath), { recursive: true });
    const tempDir = join(this.rootDir, ".tmp");
    await fs.mkdir(tempDir, { recursive: true });
    tempCounter += 1;
    const tempPath = join(
      tempDir,
      `record-${this.idHashOf(recordPath)}-${process.pid}-${tempCounter}`,
    );
    try {
      await fs.writeFile(tempPath, `${JSON.stringify(record, null, 2)}\n`, "utf8");
      await fs.rename(tempPath, recordPath);
    } finally {
      await fs.rm(tempPath, { force: true }).catch(() => undefined);
    }
  }

  /** Read a record if present; null only for ENOENT, everything else rethrows. */
  private async readQuietly(recordPath: string): Promise<Buffer | null> {
    try {
      return await fs.readFile(recordPath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  }

  /** All `*.json` ledger files under the two-hex-char shard directories. */
  private async ledgerFiles(): Promise<string[]> {
    let shards: string[];
    try {
      shards = await fs.readdir(this.rootDir);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    }
    const files: string[] = [];
    for (const shard of shards) {
      if (!/^[0-9a-f]{2}$/.test(shard)) continue; // never descend into .tmp
      const shardDir = join(this.rootDir, shard);
      for (const name of await fs.readdir(shardDir)) {
        if (name.endsWith(".json")) files.push(join(shardDir, name));
      }
    }
    return files;
  }

  /**
   * Parse + integrity-verify one ledger record: it must be a JSON object
   * carrying the required fields, and its editorSessionId must hash back
   * to the file's own address. Violations are typed integrity errors.
   */
  private parseRecord(
    source: string,
    expectedIdHash: string,
    recordPath: string,
  ): EditorSessionRecord {
    const where = this.idHashOf(recordPath);
    const fail = (reason: string): never => {
      throw new EditorSessionHistoryIntegrityError(
        `session history ledger entry ${recordPath} failed integrity checks (${reason})`,
        `${where}:${reason}`,
      );
    };
    let parsed: unknown;
    try {
      parsed = JSON.parse(source);
    } catch {
      return fail("not-json");
    }
    if (!isPlainObject(parsed)) return fail("not-an-object");
    if (typeof parsed.editorSessionId !== "string") return fail("missing-editorSessionId");
    if (this.hash(parsed.editorSessionId) !== expectedIdHash) return fail("id-address-mismatch");
    if (typeof parsed.editorId !== "string") return fail("missing-editorId");
    if (typeof parsed.revisionId !== "string") return fail("missing-revisionId");
    if (!MODES.includes(parsed.mode as string)) return fail("bad-mode");
    if (
      parsed.integrationLevel !== 1 &&
      parsed.integrationLevel !== 2 &&
      parsed.integrationLevel !== 3
    ) {
      return fail("bad-integrationLevel");
    }
    if (typeof parsed.openedAt !== "string") return fail("missing-openedAt");
    if (parsed.closedAt !== undefined && typeof parsed.closedAt !== "string") {
      return fail("bad-closedAt");
    }
    if (!isPlainObject(parsed.policy)) return fail("missing-policy");
    if (!isPlainObject(parsed.policy.rights)) return fail("missing-policy-rights");
    if (!Array.isArray(parsed.policy.rights.usages)) return fail("bad-policy-rights-usages");
    if (!Array.isArray(parsed.policy.rights.prohibitions)) {
      return fail("bad-policy-rights-prohibitions");
    }
    // Reconstruct from the validated fields (the policy block is carried
    // verbatim; its rights.usages/prohibitions arrays were just checked).
    const record: EditorSessionRecord = {
      editorSessionId: parsed.editorSessionId,
      editorId: parsed.editorId,
      revisionId: parsed.revisionId,
      mode: parsed.mode as EditorSessionRecord["mode"],
      integrationLevel: parsed.integrationLevel as 1 | 2 | 3,
      openedAt: parsed.openedAt,
      ...(parsed.closedAt === undefined ? {} : { closedAt: parsed.closedAt }),
      policy: parsed.policy as unknown as EditorSessionRecord["policy"],
    };
    return record;
  }
}
