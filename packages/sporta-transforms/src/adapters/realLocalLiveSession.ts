/**
 * W10A-2 — the bounded live session (adapters layer, internal
 * machinery of RealLocalHttpLiveSourceAdapter). Implements the frozen
 * `LiveSessionHandle` over a FIFO frame queue bounded by the
 * descriptor's `queueBound` (ADR rule 16).
 *
 * State-only law: this class owns SESSION STATE — every IO effect
 * (clear the cadence timer, destroy the client, stop the server) is
 * the injected `stop` callback owned by the adapter; record stamps
 * come from the injected clock. Back-pressure law: a frame ARRIVING
 * at a full queue latches a typed `queue-overflow` refusal IMMEDIATELY,
 * finalizing the evidence as `refused` with the partial counts
 * retained — no unbounded growth, no silent drops, no unbounded
 * blocking (every pending next() is woken by a lifecycle event: frame
 * arrival, refusal latch, clean stream end, consumer close).
 */
import type {
  LiveCloseReason,
  LiveFrame,
  LiveIngressRefusal,
  LiveSessionEvidence,
  LiveSessionHandle,
  LiveSourceDescriptor,
} from "../domain/liveSource.js";

/** The frozen next() result shape (named for readability). */
type NextResult = { frame: LiveFrame } | { refusal: LiveIngressRefusal; done: true };

/** One arrived frame waiting in the bounded queue. */
interface QueuedFrame {
  readonly index: number;
  readonly payload: string;
  readonly receivedAt: string;
}

/** Finalized session outcome — set exactly once (refusal latch or consumer close). */
interface SessionOutcome {
  readonly closeReason: LiveCloseReason;
  readonly closedAt: string;
  readonly refusal: LiveIngressRefusal | null;
}

/** Constructor deps: the descriptor under session, an injectable clock, the adapter-owned stop effect and its completion signal. */
export interface RealLocalLiveSessionDeps {
  readonly descriptor: LiveSourceDescriptor;
  readonly openedAt: string;
  readonly clock: { now(): string };
  /** Stops the session's real IO (cadence timer, client socket, server). Idempotent. */
  readonly stop: () => void;
  /** Resolves once the session's real server has fully closed. */
  readonly stopped: Promise<void>;
}

/** The bounded live session (see the file header for the state laws). */
export class RealLocalLiveSession implements LiveSessionHandle {
  private readonly descriptor: LiveSourceDescriptor;
  private readonly openedAt: string;
  private readonly clock: { now(): string };
  private readonly stop: () => void;
  private readonly stopped: Promise<void>;
  private readonly queue: QueuedFrame[] = [];
  private readonly waiters: Array<(result: NextResult) => void> = [];
  private received = 0;
  private consumed = 0;
  private outcome: SessionOutcome | null = null;
  private terminal: { refusal: LiveIngressRefusal } | null = null;

  constructor(deps: RealLocalLiveSessionDeps) {
    this.descriptor = deps.descriptor;
    this.openedAt = deps.openedAt;
    this.clock = deps.clock;
    this.stop = deps.stop;
    this.stopped = deps.stopped;
  }

  /**
   * A complete frame arrived from the wire (the client leg calls this).
   * A full queue refuses typed at the arrival — the honest arithmetic
   * (arrival number, received / consumed / queued counts) is stated in
   * the detail so no frame is dropped unaccounted.
   */
  arrive(payload: string): void {
    if (this.outcome !== null || this.terminal !== null) {
      // Post-terminal wire data is teardown fallout of the RECORDED cause —
      // the session record already says why it ended; nothing is swallowed.
      return;
    }
    this.received += 1;
    if (this.queue.length >= this.descriptor.queueBound) {
      const refusal: LiveIngressRefusal = {
        kind: "queue-overflow",
        detail: `queue bound ${this.descriptor.queueBound} exceeded at frame arrival ${this.received}: received ${this.received} frames, ${this.consumed} consumed, ${this.queue.length} queued, 1 refused at arrival — back-pressure law (no silent drops, no unbounded growth)`,
        framesConsumed: this.consumed,
      };
      this.endSession({ closeReason: "refused", closedAt: this.clock.now(), refusal }, refusal);
      return;
    }
    this.queue.push({ index: this.received - 1, payload, receivedAt: this.clock.now() });
    const waiter = this.waiters.shift();
    if (waiter !== undefined) waiter(this.resolveNext());
  }

  /** The stream ended cleanly (the finite frame list is exhausted). */
  endCleanly(): void {
    if (this.outcome !== null || this.terminal !== null) return;
    this.terminal = {
      refusal: {
        kind: "source-unavailable",
        detail: `live source stream ended cleanly after ${this.received} frames (finite frame list exhausted)`,
        framesConsumed: this.consumed,
      },
    };
    this.wakeAll();
  }

  /**
   * A mid-stream failure latches a typed refusal and finalizes the
   * evidence as `refused` (a failed source is never successful).
   * Ignored when the session already ended — the first terminal wins.
   */
  latchRefusal(kind: "source-unavailable", detail: string): void {
    if (this.outcome !== null || this.terminal !== null) return;
    const refusal: LiveIngressRefusal = { kind, detail, framesConsumed: this.consumed };
    this.endSession({ closeReason: "refused", closedAt: this.clock.now(), refusal }, refusal);
  }

  async next(): Promise<NextResult> {
    const immediate = this.resolveNextOrNull();
    if (immediate !== null) return immediate;
    return new Promise<NextResult>((resolve) => {
      this.waiters.push(resolve);
    });
  }

  /**
   * Honest cancellation (P10-04): stops the session's real IO and
   * finalizes the evidence with the caller's reason — UNLESS the
   * session already finalized by refusal (a refused session is never
   * re-labeled "completed"). Idempotent.
   */
  async close(reason: "completed" | "aborted"): Promise<LiveSessionEvidence> {
    if (this.outcome === null) {
      const terminalRefusal: LiveIngressRefusal =
        this.terminal?.refusal ??
        {
          kind: "aborted",
          detail: `session closed by consumer (${reason}) before the stream ended — no further frames`,
          framesConsumed: this.consumed,
        };
      this.endSession({ closeReason: reason, closedAt: this.clock.now(), refusal: null }, terminalRefusal);
    }
    await this.stopped;
    return this.evidence();
  }

  evidence(): LiveSessionEvidence {
    return {
      descriptor: this.descriptor,
      framesConsumed: this.consumed,
      openedAt: this.openedAt,
      closedAt: this.outcome?.closedAt ?? null,
      closeReason: this.outcome?.closeReason ?? "in-flight",
      refusal: this.outcome?.refusal ?? null,
    };
  }

  /**
   * Adapter dispose: force-finalize every still-open session — a
   * cleanly-ended stream completes (the source did its job); anything
   * still streaming aborts. All real IO stops either way.
   */
  async dispose(): Promise<void> {
    if (this.outcome === null) {
      await this.close(this.terminal !== null ? "completed" : "aborted");
      return;
    }
    this.stop();
    await this.stopped;
  }

  /** Set the outcome + terminal together, wake every waiter, stop the IO. */
  private endSession(outcome: SessionOutcome, terminalRefusal: LiveIngressRefusal): void {
    this.outcome = outcome;
    this.terminal = { refusal: terminalRefusal };
    this.wakeAll();
    this.stop();
  }

  /** Resolve one next() against the current state, or null when a waiter must wait. */
  private resolveNextOrNull(): NextResult | null {
    if (this.outcome !== null) {
      // Refused or closed: no further frames are delivered.
      return { refusal: this.terminal?.refusal ?? closedRefusal(this.consumed), done: true };
    }
    if (this.queue.length > 0) {
      const frame = this.queue.shift();
      if (frame === undefined) return null;
      this.consumed += 1;
      return { frame: { index: frame.index, payload: frame.payload, receivedAt: frame.receivedAt } };
    }
    if (this.terminal !== null) {
      return { refusal: this.terminal.refusal, done: true };
    }
    return null;
  }

  /** Wake-path resolution used by arrive() after pushing a frame. */
  private resolveNext(): NextResult {
    const result = this.resolveNextOrNull();
    // Called only with a freshly queued frame or a terminal latched — always resolvable.
    return result ?? { refusal: closedRefusal(this.consumed), done: true };
  }

  /** Wake every pending waiter with the current resolvable state. */
  private wakeAll(): void {
    for (const waiter of this.waiters.splice(0)) {
      const result = this.resolveNextOrNull();
      waiter(result ?? { refusal: closedRefusal(this.consumed), done: true });
    }
  }
}

/** Defensive terminal (unreachable in practice — never a silent hang). */
function closedRefusal(framesConsumed: number): LiveIngressRefusal {
  return {
    kind: "aborted",
    detail: "session ended while a frame was expected — defensive abort, no silent hang",
    framesConsumed,
  };
}
