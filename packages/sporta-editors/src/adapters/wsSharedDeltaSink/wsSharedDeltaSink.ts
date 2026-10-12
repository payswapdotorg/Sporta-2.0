/**
 * w6c-1: REAL transport SharedDeltaSinkPort — stdlib-only RFC 6455 WebSocket fan-out, wired into
 * the frozen SharedEditorSessionService broadcast seam. Implements the frozen
 * `SharedDeltaSinkPort` from domain/sharedSession/ports.ts (ASSUMED-FROZEN-SURFACE appendix A of
 * the w6c report; if the frozen receipt type differs, the single mapping point is `deliver`'s
 * return below).
 *
 * Port-law mapping (SPEC §W6C-1):
 * - deliver(serializedDelta) → one text frame per connected client, receipts recorded PER CLIENT.
 * - zero clients → zero deliveries, NOT an error.
 */
import type { SharedDeltaDelivery, SharedDeltaSinkPort } from '../../domain/sharedSession/ports.js';
import { WsServer, type WsCloseInfo } from './wsServer.js';

export interface WsSharedDeltaSinkOptions {
  /** Exact upgrade path; default '/shared-deltas'. */
  readonly path?: string;
  readonly maxFramePayloadBytes?: number;
  /** Bounded per-client receipt history; default 128. */
  readonly receiptHistoryPerClient?: number;
}

export interface WsDeliveryRecord {
  readonly clientId: string;
  readonly ok: boolean;
  readonly error?: string;
}

export interface WsDeliveryReceipt {
  readonly attempted: number;
  readonly delivered: number;
  readonly records: readonly WsDeliveryRecord[];
}

export class WsSharedDeltaSink implements SharedDeltaSinkPort {
  private readonly server: WsServer;
  private readonly receiptHistory = new Map<string, WsDeliveryRecord[]>();
  private readonly receiptHistoryPerClient: number;
  private boundPort: number | null = null;

  constructor(options: WsSharedDeltaSinkOptions = {}) {
    this.receiptHistoryPerClient = options.receiptHistoryPerClient ?? 128;
    this.server = new WsServer({ path: options.path ?? '/shared-deltas', maxFramePayloadBytes: options.maxFramePayloadBytes });
  }

  /** Binds the underlying HTTP listener. Port 0 → OS-assigned; resolves with the ACTUAL port. */
  async listen(port: number, host: string = '127.0.0.1'): Promise<number> {
    this.boundPort = await this.server.listen(port, host);
    return this.boundPort;
  }

  get port(): number | null {
    return this.boundPort;
  }

  get clientCount(): number {
    return this.server.connectionCount();
  }

  clientIds(): string[] {
    return this.server.connectionIds();
  }

  receiptsFor(clientId: string): readonly WsDeliveryRecord[] {
    return this.receiptHistory.get(clientId) ?? [];
  }

  /**
   * Appendix-A mapping point (the SINGLE frozen-surface seam): the frozen
   * `SharedDeltaSinkPort.publish(delivery)` serializes the typed delivery
   * (sessionId + ordered entry + recipients) as ONE JSON text frame and
   * fans it out; the void return is the port contract — per-client receipts
   * remain queryable via `receiptsFor`.
   */
  async publish(delivery: SharedDeltaDelivery): Promise<void> {
    await this.deliver(JSON.stringify(delivery));
  }

  /** Fan-out the serialized delta to every connected client. Zero clients = zero deliveries, not an error. */
  async deliver(serializedDelta: string): Promise<WsDeliveryReceipt> {
    const connections = this.server.listConnections(); // snapshot at call start (documented in SPEC)
    const records: WsDeliveryRecord[] = [];
    for (const connection of connections) {
      try {
        await connection.sendText(serializedDelta);
        records.push({ clientId: connection.id, ok: true });
      } catch (err) {
        records.push({ clientId: connection.id, ok: false, error: err instanceof Error ? err.message : String(err) });
      }
    }
    for (const record of records) this.recordReceipt(record);
    return { attempted: records.length, delivered: records.filter((record) => record.ok).length, records };
  }

  private recordReceipt(record: WsDeliveryRecord): void {
    const history = this.receiptHistory.get(record.clientId) ?? [];
    history.push(record);
    if (history.length > this.receiptHistoryPerClient) {
      history.splice(0, history.length - this.receiptHistoryPerClient);
    }
    this.receiptHistory.set(record.clientId, history);
  }

  /** Closes every client with 1001, then stops the listener; resolves only after sockets are down. */
  async close(): Promise<void> {
    await this.server.close();
    this.boundPort = null;
  }
}

export type { WsCloseInfo };
