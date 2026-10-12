/**
 * w6c-4 REAL adapter: projects the REAL `FsSharedSessionStore` ledger surface
 * onto `SharedSessionProjectionPort` for the product takeover UX.
 *
 * Discovery law (honest, no private-API reach): the store persists one ledger
 * JSON per session at `rootDir/<hash[0:2]>/<hash>.json` (public layout
 * documented on the store). This adapter enumerates that layout ONLY to
 * discover session ids (`session.sessionId` inside each ledger file — an
 * unverified raw read); every row it then reports is built from the store's
 * PUBLIC verified reads (`findSession` / `findCoordination` /
 * `findCloseResult`), so integrity verification stays where it belongs.
 *
 * READ-ONLY: this adapter never writes. The level-3 service is the sole writer.
 */
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import type {
  FsSharedSessionStore,
  SharedSessionCloseResult,
  SharedSessionCoordination,
  SharedSessionRecord,
} from '@sporta/editors/contract';
import type {
  SharedSessionDeltaLogRow,
  SharedSessionProjectionPort,
  SharedSessionSummaryRow,
} from './sharedSessionProjectionPort.js';

export class SharedSessionStoreProjection implements SharedSessionProjectionPort {
  constructor(
    private readonly store: FsSharedSessionStore,
    private readonly rootDir: string,
  ) {}

  async listSessions(): Promise<readonly SharedSessionSummaryRow[]> {
    const ids = await this.discoverSessionIds();
    const rows = [];
    for (const id of ids) {
      const row = await this.rowFor(id);
      if (row !== null) rows.push(row);
    }
    return rows;
  }

  async getSession(sessionId: string): Promise<SharedSessionSummaryRow | null> {
    return this.rowFor(sessionId);
  }

  async getDeltaLog(sessionId: string): Promise<readonly SharedSessionDeltaLogRow[] | null> {
    const coordination = await this.store.findCoordination(sessionId);
    if (coordination === null) return null;
    return coordination.log.map((entry) => ({ revision: entry.sequence, payload: entry.operations }));
  }

  /** The verified row for one session (null when the store has no record). */
  private async rowFor(sessionId: string) {
    const record = await this.store.findSession(sessionId);
    if (record === null) return null;
    const coordination = await this.store.findCoordination(sessionId);
    return {
      sessionId: record.sessionId,
      status: record.state,
      participants: record.participants.map((p) => p.participantId),
      headRevision: coordination?.lastSequence ?? 0,
    };
  }

  /**
   * Discover session ids from the public ledger layout. The raw JSON read
   * here is id DISCOVERY only — rows come from the verified public reads.
   */
  private async discoverSessionIds(): Promise<string[]> {
    const ids: string[] = [];
    let prefixDirs: readonly string[] = [];
    try {
      prefixDirs = await fs.readdir(this.rootDir);
    } catch {
      return []; // absent root = empty ledger = honest empty list
    }
    for (const prefix of prefixDirs) {
      const prefixPath = join(this.rootDir, prefix);
      let stat;
      try {
        stat = await fs.stat(prefixPath);
      } catch {
        continue;
      }
      if (!stat.isDirectory()) continue;
      let files: readonly string[] = [];
      try {
        files = await fs.readdir(prefixPath);
      } catch {
        continue;
      }
      for (const file of files) {
        if (!file.endsWith('.json')) continue;
        try {
          const raw = JSON.parse((await fs.readFile(join(prefixPath, file))).toString('utf-8')) as {
            session?: { sessionId?: unknown };
          };
          const id = raw.session?.sessionId;
          if (typeof id === 'string' && id.length > 0) ids.push(id);
        } catch {
          // an unreadable/corrupt ledger is skipped at DISCOVERY time only;
          // verified reads for a known id still surface typed errors.
        }
      }
    }
    return ids;
  }
}

export type { SharedSessionRecord, SharedSessionCoordination, SharedSessionCloseResult };
