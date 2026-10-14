/**
 * W10A-2 — the REAL local HTTP live-source adapter (adapters layer,
 * P10-02..P10-04). Implements the frozen `LiveSourcePort` with a REAL
 * `node:http` streaming server (chunked text frames written at the
 * descriptor's declared cadence on a real ephemeral localhost port)
 * and a REAL client consumption leg feeding a bounded frame queue.
 * Node built-ins ONLY — no external dependency ever enters this
 * package (P10-18).
 *
 * EVIDENCE CLASS: REAL-LOCAL — real server sockets, real chunked
 * writes, real client reads, real connection refusals after the
 * server stops. Honest grade: `real-local-live` (the closed
 * vocabulary makes "production" unutterable); a descriptor declaring
 * any other grade is refused typed before any IO.
 *
 * Session law: one session = one real server; close / refusal /
 * dispose stops it for real (cadence timers cleared, sockets
 * destroyed, `server.close()` awaited) — a stopped session's port
 * refuses new connections.
 */
import { createServer, request } from "node:http";
import type { ClientRequest, IncomingMessage, Server } from "node:http";
import type { AddressInfo, Socket } from "node:net";
import { systemClockNow } from "./clock.js";
import { RealLocalLiveSession } from "./realLocalLiveSession.js";
import {
  validateLiveSourceDescriptor,
  type LiveIngressRefusal,
  type LiveSessionHandle,
  type LiveSourceDescriptor,
  type LiveSourcePort,
} from "../domain/liveSource.js";

/** Constructor deps (wiring-time config; real defaults). */
export interface RealLocalHttpLiveSourceDeps {
  /** The finite frame-payload sequence the real server streams (non-empty, newline-free strings). */
  readonly frames: readonly string[];
  /** Injectable clock for session records (default: the real system clock). */
  readonly clock?: { now(): string };
  /** Bind host (default "127.0.0.1" — the real-local lane is localhost-only). */
  readonly hostname?: string;
  /** Bind port (default 0 = a real ephemeral port per session). */
  readonly port?: number;
}

/** The REAL local HTTP live-source adapter. See the file header for the evidence law. */
export class RealLocalHttpLiveSourceAdapter implements LiveSourcePort {
  private readonly frames: readonly string[];
  private readonly clock: { now(): string };
  private readonly bindHost: string;
  private readonly bindPort: number;
  private readonly sessionsByBinding = new Map<RealLocalLiveSession, { readonly hostname: string; readonly port: number }>();

  constructor(deps: RealLocalHttpLiveSourceDeps) {
    if (!Array.isArray(deps.frames) || deps.frames.length === 0) {
      throw new Error("RealLocalHttpLiveSourceAdapter requires a non-empty frame list — the server streams a finite, declared frame sequence");
    }
    for (const [index, payload] of deps.frames.entries()) {
      if (typeof payload !== "string" || payload.length === 0 || payload.includes("\n")) {
        throw new Error(`frame ${index} must be a non-empty string without newline (one frame = one newline-delimited chunk)`);
      }
    }
    this.frames = [...deps.frames];
    this.clock = deps.clock ?? { now: systemClockNow };
    this.bindHost = deps.hostname ?? "127.0.0.1";
    this.bindPort = deps.port ?? 0;
  }

  /**
   * Real bindings of the currently-active session servers — the live
   * source's real endpoint, observable for operations and tests (an
   * empty list means every server has stopped).
   */
  activeBindings(): readonly { readonly hostname: string; readonly port: number }[] {
    return [...this.sessionsByBinding.values()];
  }

  /**
   * Force-finalize every still-open session (cleanly-ended streams
   * complete; the rest abort) and stop every real server — clean
   * teardown for owners and tests.
   */
  async dispose(): Promise<void> {
    // Snapshot first: disposal removes bindings while iterating.
    const sessions = [...this.sessionsByBinding.keys()];
    for (const session of sessions) {
      await session.dispose();
    }
  }

  async open(
    descriptor: LiveSourceDescriptor,
  ): Promise<{ handle: LiveSessionHandle } | { refusal: LiveIngressRefusal }> {
    // Fail-closed validation BEFORE any IO (P10-01).
    const validation = validateLiveSourceDescriptor(descriptor);
    if (!validation.ok) return { refusal: validation.refusal };
    // Grade law: this adapter serves the real-local lane only — never a mislabeled descriptor.
    if (descriptor.grade !== "real-local-live") {
      return {
        refusal: {
          kind: "invalid-descriptor",
          detail: `this adapter serves grade "real-local-live" only (a real localhost HTTP stream); descriptor declared "${descriptor.grade}" — refused rather than mislabeled`,
          framesConsumed: 0,
        },
      };
    }

    const sockets = new Set<Socket>();
    let cadenceTimer: NodeJS.Timeout | undefined;
    let stopCalled = false;
    let clientRequest: ClientRequest | undefined;
    let served = false;
    let session: RealLocalLiveSession | undefined;
    let settleStopped!: () => void;
    const stopped = new Promise<void>((resolve) => {
      settleStopped = resolve;
    });

    const stop = (): void => {
      if (stopCalled) return;
      stopCalled = true;
      if (cadenceTimer !== undefined) {
        clearTimeout(cadenceTimer);
        cadenceTimer = undefined;
      }
      clientRequest?.destroy();
      for (const socket of sockets) socket.destroy();
      sockets.clear();
      if (server.listening) server.close();
    };

    // The REAL streaming server: one session = one request; frame i is
    // written at i * cadenceMs as one chunk (payload + "\n"), then the
    // chunked response ends after the last frame.
    const server: Server = createServer((_request, response) => {
      if (served) {
        response.writeHead(409, { "content-type": "text/plain" });
        response.end("live source session already served");
        return;
      }
      served = true;
      response.writeHead(200, { "content-type": descriptor.contentKind });
      let nextFrame = 0;
      const sendNext = (): void => {
        if (stopCalled) return;
        if (nextFrame >= this.frames.length) {
          response.end();
          return;
        }
        const payload = this.frames[nextFrame];
        nextFrame += 1;
        if (payload !== undefined) response.write(`${payload}\n`);
        cadenceTimer = setTimeout(sendNext, descriptor.cadenceMs);
      };
      sendNext();
    });
    server.once("close", () => {
      settleStopped();
      if (session !== undefined) this.sessionsByBinding.delete(session);
    });
    server.on("connection", (socket: Socket) => {
      sockets.add(socket);
      socket.once("close", () => {
        sockets.delete(socket);
      });
    });
    server.on("clientError", (_error, socket) => {
      socket.destroy();
    });

    session = new RealLocalLiveSession({
      descriptor,
      openedAt: this.clock.now(),
      clock: this.clock,
      stop,
      stopped,
    });
    const liveSession = session;

    // Post-listen server failures latch typed into the session.
    server.on("error", (error: Error) => {
      liveSession.latchRefusal("source-unavailable", `live source server error: ${errorMessage(error)}`);
      stop();
    });

    // Real listen on an ephemeral port.
    try {
      await new Promise<void>((resolve, reject) => {
        const onListenError = (error: Error): void => {
          reject(error);
        };
        server.once("error", onListenError);
        server.listen(this.bindPort, this.bindHost, () => {
          server.off("error", onListenError);
          resolve();
        });
      });
    } catch (error) {
      stop();
      return {
        refusal: {
          kind: "source-unavailable",
          detail: `real local server failed to listen on ${this.bindHost}:${this.bindPort}: ${errorMessage(error)}`,
          framesConsumed: 0,
        },
      };
    }
    const address = server.address() as AddressInfo;
    this.sessionsByBinding.set(liveSession, { hostname: this.bindHost, port: address.port });

    // The REAL client leg over a real socket, newline-delimited frames.
    const wireResponse = (res: IncomingMessage): void => {
      res.setEncoding("utf8");
      let pending = "";
      res.on("data", (chunk: string) => {
        pending += chunk;
        for (;;) {
          const newline = pending.indexOf("\n");
          if (newline < 0) break;
          const payload = pending.slice(0, newline);
          pending = pending.slice(newline + 1);
          liveSession.arrive(payload);
        }
      });
      res.on("end", () => {
        if (pending.length > 0) {
          liveSession.latchRefusal(
            "source-unavailable",
            `stream ended with a partial trailing frame (${pending.length} bytes without a newline) — refused rather than dropped silently`,
          );
          stop();
          return;
        }
        liveSession.endCleanly();
      });
      res.on("error", (error: Error) => {
        liveSession.latchRefusal("source-unavailable", `client stream error: ${errorMessage(error)}`);
        stop();
      });
    };

    // One-shot streaming session: `connection: close` keeps the socket
    // out of any keep-alive pool so the session's socket lifecycle is
    // exactly the session's (honest, deterministic teardown).
    const client = request({
      host: this.bindHost,
      port: address.port,
      path: "/live",
      method: "GET",
      headers: { connection: "close" },
    });
    clientRequest = client;
    client.end();
    try {
      await new Promise<void>((resolve, reject) => {
        client.once("error", (error: Error) => {
          reject(error);
        });
        client.once("response", (res: IncomingMessage) => {
          wireResponse(res);
          resolve();
        });
      });
    } catch (error) {
      stop();
      return {
        refusal: {
          kind: "source-unavailable",
          detail: `real client could not reach the live source at ${this.bindHost}:${address.port}: ${errorMessage(error)}`,
          framesConsumed: 0,
        },
      };
    }
    // Post-header socket failures latch typed; post-finalization noise is the recorded cause's fallout.
    client.on("error", (error: Error) => {
      liveSession.latchRefusal("source-unavailable", `client request error: ${errorMessage(error)}`);
      stop();
    });

    return { handle: liveSession };
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
