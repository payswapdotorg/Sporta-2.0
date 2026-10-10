import type { SportaId } from "@sporta/contracts/contract";
import type { SharedSessionCoordination } from "../domain/sharedSession/coordination.js";
import type {
  SharedSessionCloseResult,
  SharedSessionStorePort,
} from "../domain/sharedSession/ports.js";
import type { SharedSessionRecord } from "../domain/sharedSession/session.js";
/**
 * In-memory shared-session store (fixture-grade).
 *
 * Sole owner of shared-session records, coordination state and close
 * memos: sessions/coordination are last-write-wins state transitions;
 * close results are first-write-wins memos.
 */
export class InMemorySharedSessionStore implements SharedSessionStorePort {
  private readonly sessions = new Map<SportaId, SharedSessionRecord>();
  private readonly coordinations = new Map<SportaId, SharedSessionCoordination>();
  private readonly closeResults = new Map<SportaId, SharedSessionCloseResult>();

  async saveSession(record: SharedSessionRecord): Promise<void> {
    this.sessions.set(record.sessionId, record);
  }

  async findSession(sessionId: SportaId): Promise<SharedSessionRecord | null> {
    return this.sessions.get(sessionId) ?? null;
  }

  async saveCoordination(coordination: SharedSessionCoordination): Promise<void> {
    this.coordinations.set(coordination.sessionId, coordination);
  }

  async findCoordination(sessionId: SportaId): Promise<SharedSessionCoordination | null> {
    return this.coordinations.get(sessionId) ?? null;
  }

  async saveCloseResult(sessionId: SportaId, result: SharedSessionCloseResult): Promise<void> {
    if (this.closeResults.has(sessionId)) return; // first write wins (memo)
    this.closeResults.set(sessionId, result);
  }

  async findCloseResult(sessionId: SportaId): Promise<SharedSessionCloseResult | null> {
    return this.closeResults.get(sessionId) ?? null;
  }
}
