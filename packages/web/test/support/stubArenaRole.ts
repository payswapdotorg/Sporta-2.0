/**
 * Test support for the W4C-3 headless host-composition test
 * (packages/web/test/sportaHost.test.ts).
 *
 * Copied from packages/sporta-product/test/a17FullRealSupport.ts
 * (StubArenaRole) — same law, same labeling, kept local because test
 * support is not package-contract surface and @zcode/web must not import
 * from @sporta/* test trees (the composition imports resolve through the
 * package boundary only; the transitional symlink law covers
 * node_modules/@sporta, not test-internal files).
 *
 * EVIDENCE CLASS: a REAL node:http TCP server on an ephemeral localhost
 * port speaking the Arena HTTP contract (POST /escalations, GET
 * /escalations/:id). The SOCKETS, REQUESTS and RESPONSES are real; the
 * Arena ROLE behind the server (the expert session and its lifecycle
 * advancement) is fixture-scripted by the test. When its lifecycle
 * passes validating -> accepted_result the stub flips the result
 * record's `validated` flag — the ARENA-side validation gate (the
 * lifecycle's own meaning), NOT Sporta-side validation.
 */
import { createHash } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { promises as fs } from "node:fs";

/** One request the stub Arena observed, with its parsed JSON body. */
export interface CapturedArenaRequest {
  method: string;
  path: string;
  body: unknown;
}

/** The legal escalation lifecycle chain, as the Arena role walks it. */
const LIFECYCLE_CHAIN: readonly string[] = [
  "created",
  "triaged",
  "matching",
  "offered",
  "accepted",
  "session_ready",
  "in_progress",
  "submitted",
  "validating",
  "accepted_result",
  "closed",
];

interface StubArenaEntry {
  lifecycle: string;
  result: Record<string, unknown> | null;
}

/** A real-HTTP fixture-scripted Arena role. */
export class StubArenaRole {
  readonly requests: CapturedArenaRequest[] = [];
  readonly #known = new Map<string, StubArenaEntry>();
  readonly #server: Server;

  private constructor(server: Server) {
    this.#server = server;
  }

  static async start(): Promise<StubArenaRole> {
    const role = new StubArenaRole(createServer((req, res) => void role.#handle(req, res)));
    await new Promise<void>((resolve) => role.#server.listen(0, "localhost", resolve));
    return role;
  }

  get baseUrl(): string {
    const address = this.#server.address();
    if (address === null || typeof address !== "object") {
      throw new Error("stub arena: expected an ephemeral TCP port");
    }
    return `http://localhost:${address.port}`;
  }

  async close(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      this.#server.close((error) => (error === undefined ? resolve() : reject(error)));
    });
  }

  /**
   * Scripted expert session: advance the Arena-side lifecycle step by
   * step along the legal chain up to `target`. The result is produced at
   * "submitted"; the Arena-side `validated` flag flips to true when the
   * "validating" -> "accepted_result" gate passes.
   */
  advanceTo(escalationId: string, target: string): void {
    const entry = this.#known.get(escalationId);
    if (entry === undefined) {
      throw new Error(`stub arena: unknown escalation ${escalationId}`);
    }
    while (entry.lifecycle !== target) {
      const index = LIFECYCLE_CHAIN.indexOf(entry.lifecycle);
      const next = LIFECYCLE_CHAIN[index + 1];
      if (next === undefined || LIFECYCLE_CHAIN.indexOf(target) < index + 1) {
        throw new Error(`stub arena: cannot reach ${target} from ${entry.lifecycle}`);
      }
      entry.lifecycle = next;
      if (next === "submitted" && entry.result === null) {
        entry.result = this.#produceResult(escalationId);
      }
      if (next === "accepted_result" && entry.result !== null) {
        entry.result = { ...entry.result, validated: true };
      }
    }
  }

  async #handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    try {
      const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
      const method = req.method ?? "GET";
      let body: unknown = null;
      if (method === "POST") {
        const chunks: Buffer[] = [];
        for await (const chunk of req) chunks.push(chunk as Buffer);
        try {
          body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
        } catch {
          body = null;
        }
      }
      this.requests.push({ method, path: url.pathname, body });

      if (method === "POST" && url.pathname === "/escalations") {
        const parsed = body as { escalation?: { escalationId?: string } } | null;
        const escalationId = parsed?.escalation?.escalationId ?? "esc:unknown";
        if (!this.#known.has(escalationId)) {
          this.#known.set(escalationId, { lifecycle: "created", result: null });
        }
        res.writeHead(201, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ escalationId, lifecycle: "created" }));
        return;
      }

      if (method === "GET" && url.pathname.startsWith("/escalations/")) {
        const escalationId = decodeURIComponent(url.pathname.slice("/escalations/".length));
        const entry = this.#known.get(escalationId);
        if (entry === undefined) {
          res.writeHead(404, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Not found" }));
          return;
        }
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ lifecycle: entry.lifecycle, result: entry.result }));
        return;
      }

      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Not found" }));
    } catch (error) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: String(error) }));
    }
  }

  /** The scripted expert's deliverable (fixture payload, real sha-256 hash). */
  #produceResult(escalationId: string): Record<string, unknown> {
    const payload = `stub-arena:expert-solution:${escalationId}`;
    return {
      resultId: `res:${escalationId}`,
      escalationId,
      resultType: "unblock",
      payloadHash: createHash("sha256").update(payload).digest("hex"),
      validated: false,
      learningArtifactRefs: [`learn:arena:${escalationId}:1`],
      provenance: {
        sourceKind: "arena-session",
        sourceRef: escalationId,
        capturedAt: new Date().toISOString(),
      },
    };
  }
}

/** Count regular files under a directory recursively (REAL FS observation). */
export async function countFiles(root: string): Promise<number> {
  let count = 0;
  let entries: Awaited<ReturnType<typeof fs.readdir>>;
  try {
    entries = await fs.readdir(root, { withFileTypes: true });
  } catch {
    return 0;
  }
  for (const entry of entries) {
    const path = `${root}/${entry.name}`;
    if (entry.isDirectory()) {
      count += await countFiles(path);
    } else if (entry.isFile()) {
      count += 1;
    }
  }
  return count;
}
