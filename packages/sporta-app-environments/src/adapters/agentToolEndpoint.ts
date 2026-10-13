/**
 * The generic app-action tool endpoint (adapters layer, W9C-6/7).
 *
 * The demo wiring of the ZCode generic tool boundary for attached
 * applications: a REAL node:http server on 127.0.0.1 (OS-assigned
 * port) that exposes ONE capability-generic HTTP tool surface — an
 * agent process (spawned by the real ZCode AgentRuntime adapter, like
 * browser/terminal tools live in the CLI) POSTs an action request and
 * receives the typed admission + audit outcome as JSON. No
 * app-specific shell surface exists: the endpoint speaks
 * capabilityIds, never app internals.
 *
 * This mirrors the Arena HTTP-transport precedent (a local tool
 * boundary the composition owns) — NOT a second runtime: admission,
 * grants and audit stay in the ApplicationActionService; the endpoint
 * only transports.
 */
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import type { ApplicationActionOutcome } from "../domain/ports.js";
import type { ApplicationActionService } from "../app/applicationActionService.js";

/** Constructor dependencies. */
export interface ApplicationActionToolEndpointDeps {
  /** The single action authority (admission -> execution -> audit). */
  actions: ApplicationActionService;
  /** Bind host (default 127.0.0.1 — the local-install posture). */
  host?: string;
  /** Bind port (default 0 = OS-assigned; reported by listen()). */
  port?: number;
}

/** One JSON-serializable tool response (the typed outcome). */
export interface ApplicationActionToolResponse extends ApplicationActionOutcome {
  /** Echo of the request for correlation in agent event streams. */
  requestedCapabilityId: string;
  ok: boolean;
}

/** The REAL HTTP tool endpoint for attached-app actions. */
export class ApplicationActionToolEndpoint {
  private readonly deps: ApplicationActionToolEndpointDeps;
  private server: Server | null = null;
  private boundUrl: string | null = null;

  constructor(deps: ApplicationActionToolEndpointDeps) {
    this.deps = deps;
  }

  /** Start listening (REAL server; resolves with the bound URL). */
  async listen(): Promise<{ url: string; port: number }> {
    if (this.server !== null && this.boundUrl !== null) {
      return { url: this.boundUrl, port: this.boundPort() };
    }
    const server = createServer((request, response) => {
      void this.handle(request, response);
    });
    this.server = server;
    const host = this.deps.host ?? "127.0.0.1";
    const port = this.deps.port ?? 0;
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(port, host, () => resolve());
    });
    const address = server.address() as AddressInfo;
    this.boundUrl = `http://${host}:${address.port}/app-action`;
    return { url: this.boundUrl, port: address.port };
  }

  /** Stop listening (idempotent). */
  async close(): Promise<void> {
    const server = this.server;
    if (server === null) return;
    this.server = null;
    this.boundUrl = null;
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }

  private boundPort(): number {
    const address = this.server?.address();
    return typeof address === "object" && address !== null ? address.port : 0;
  }

  private async handle(
    request: import("node:http").IncomingMessage,
    response: import("node:http").ServerResponse,
  ): Promise<void> {
    const reply = (status: number, body: unknown): void => {
      response.writeHead(status, { "content-type": "application/json" });
      response.end(JSON.stringify(body));
    };
    if (request.method !== "POST" || request.url !== "/app-action") {
      reply(404, { ok: false, error: "the app-action tool surface is POST /app-action" });
      return;
    }
    const chunks: Buffer[] = [];
    for await (const chunk of request) {
      chunks.push(chunk as Buffer);
      if (chunks.reduce((total, chunk) => total + chunk.length, 0) > 65_536) {
        reply(413, { ok: false, error: "app-action request exceeds 64 KiB" });
        return;
      }
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } catch {
      reply(400, { ok: false, error: "app-action request body is not JSON" });
      return;
    }
    const body = parsed as {
      sessionId?: unknown;
      capabilityId?: unknown;
      actor?: unknown;
      parameters?: unknown;
      payloadText?: unknown;
      confirmed?: unknown;
    };
    if (
      typeof body.sessionId !== "string" ||
      typeof body.capabilityId !== "string" ||
      typeof body.actor !== "string"
    ) {
      reply(400, {
        ok: false,
        error: "app-action requires string sessionId, capabilityId and actor",
      });
      return;
    }
    try {
      const outcome = await this.deps.actions.performAction({
        sessionId: body.sessionId,
        capabilityId: body.capabilityId,
        actor: body.actor,
        parameters:
          typeof body.parameters === "object" && body.parameters !== null
            ? (body.parameters as Record<string, unknown>)
            : {},
        payloadText: typeof body.payloadText === "string" ? body.payloadText : null,
        confirmed: body.confirmed === true,
      });
      const toolResponse: ApplicationActionToolResponse = {
        ...outcome,
        requestedCapabilityId: body.capabilityId,
        ok: outcome.record.status === "succeeded",
      };
      reply(200, toolResponse);
    } catch (error) {
      // Typed service errors (unknown session/attachment/descriptor)
      // are honest 422s — never a crash, never a fabricated outcome.
      reply(422, {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
