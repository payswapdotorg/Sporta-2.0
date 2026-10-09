/**
 * HttpArenaTransport boundary tests.
 *
 * EVIDENCE CLASS: REAL for the transport — every case below drives the
 * real HttpArenaTransport over a real local HTTP server (node:http on
 * an ephemeral port; real sockets, real fetch, real status codes and
 * real wire JSON). The Arena role behind that server is fixture-scripted
 * (canned lifecycles/results), so these tests prove the transport's HTTP
 * behavior and its boundary validation — not any real expert session.
 *
 * Project law: node:test + tsx only — no describe/it/expect globals.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createServer,
  type IncomingHttpHeaders,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import {
  ArenaTransportError,
  HttpArenaTransport,
} from "../src/adapters/httpArenaTransport.js";
import { fixtureEscalationRecord } from "./fixtures.js";

/** One request the stub server observed, with its parsed JSON body. */
interface CapturedRequest {
  method: string;
  path: string;
  headers: IncomingHttpHeaders;
  body: unknown;
}

/** Scripted behavior of the fixture Arena role. */
interface ArenaStubOptions {
  /** Lifecycle reported by GET for a known escalation (default "triaged"). */
  lifecycle?: string;
  /** Result reported by GET for a known escalation (default null). */
  result?: Record<string, unknown> | null;
  /** Status code POST responds with (default 201). */
  submitStatus?: number;
  /** Lifecycle echoed by the POST response (default "triaged"). */
  submitLifecycle?: string;
  /** Status code GET responds with (default 200/404 by knowledge). */
  getStatus?: number;
}

interface ArenaStub {
  baseUrl: string;
  requests: CapturedRequest[];
  close(): Promise<void>;
}

/** Start a real HTTP server on an ephemeral port; resolve its base URL. */
async function listen(server: Server): Promise<string> {
  await new Promise<void>((resolve) => server.listen(0, "localhost", resolve));
  const address = server.address();
  assert.ok(address !== null && typeof address === "object", "expected an ephemeral TCP port");
  return `http://localhost:${address.port}`;
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

/**
 * A fixture-scripted Arena: POST /escalations records the escalation and
 * echoes {escalationId, lifecycle}; GET /escalations/:id answers 404 for
 * unknown escalations and {lifecycle, result} for known ones.
 */
async function startArenaStub(options: ArenaStubOptions = {}): Promise<ArenaStub> {
  const requests: CapturedRequest[] = [];
  const known = new Map<string, { lifecycle: string; result: Record<string, unknown> | null }>();
  const server = createServer((req, res) => {
    void handle(req, res);
  });

  async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
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
      requests.push({ method, path: url.pathname, headers: { ...req.headers }, body });

      if (options.getStatus !== undefined) {
        res.writeHead(options.getStatus, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "scripted status" }));
        return;
      }

      if (method === "POST" && url.pathname === "/escalations") {
        const parsed = body as { escalation?: { escalationId?: string } } | null;
        const escalationId = parsed?.escalation?.escalationId ?? "esc:unknown";
        const status = options.submitStatus ?? 201;
        if (status >= 200 && status < 300) {
          known.set(escalationId, { lifecycle: options.lifecycle ?? "triaged", result: options.result ?? null });
        }
        res.writeHead(status, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ escalationId, lifecycle: options.submitLifecycle ?? "triaged" }));
        return;
      }

      if (method === "GET" && url.pathname.startsWith("/escalations/")) {
        const escalationId = decodeURIComponent(url.pathname.slice("/escalations/".length));
        const state = known.get(escalationId);
        if (state === undefined) {
          res.writeHead(404, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Not found" }));
          return;
        }
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ lifecycle: state.lifecycle, result: state.result }));
        return;
      }

      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Not found" }));
    } catch (error) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: String(error) }));
    }
  }

  const baseUrl = await listen(server);
  return { baseUrl, requests, close: () => closeServer(server) };
}

/** A real server that answers every request after `delayMs` (timeout cases). */
async function startSlowArena(delayMs: number): Promise<ArenaStub> {
  const requests: CapturedRequest[] = [];
  const server = createServer((req, res) => {
    requests.push({
      method: req.method ?? "GET",
      path: req.url ?? "/",
      headers: { ...req.headers },
      body: null,
    });
    setTimeout(() => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ lifecycle: "triaged", result: null }));
    }, delayMs);
  });
  const baseUrl = await listen(server);
  return { baseUrl, requests, close: () => closeServer(server) };
}

/** A TCP port that is guaranteed closed (bound, then released). */
async function closedPort(): Promise<number> {
  const server = createServer();
  const baseUrl = await listen(server);
  await closeServer(server);
  return Number(new URL(baseUrl).port);
}

function expectTransportError(
  code: ArenaTransportError["code"],
  messagePattern?: RegExp,
): (error: unknown) => boolean {
  return (error: unknown) => {
    assert.ok(error instanceof ArenaTransportError, `expected ArenaTransportError, got ${String(error)}`);
    assert.equal(error.code, code);
    if (messagePattern) assert.match(error.message, messagePattern);
    return true;
  };
}

const CONTEXT_REFS: readonly string[] = ["wg:fixture", "run:fixture"];

test("constructor refuses an empty baseUrl", () => {
  assert.throws(() => new HttpArenaTransport({ baseUrl: "" }), /requires a baseUrl/);
});

test("submit POSTs exactly the escalation record and context refs — nothing else", async () => {
  const stub = await startArenaStub();
  try {
    const escalation = fixtureEscalationRecord();
    const transport = new HttpArenaTransport({ baseUrl: stub.baseUrl });
    await transport.submit({ escalation, contextRefs: [...CONTEXT_REFS] });

    const posts = stub.requests.filter((request) => request.method === "POST");
    assert.equal(posts.length, 1);
    assert.equal(posts[0]?.path, "/escalations");
    assert.deepEqual(posts[0]?.body, { escalation, contextRefs: [...CONTEXT_REFS] });
  } finally {
    await stub.close();
  }
});

test("submit is idempotent: a retry never re-POSTs an escalation the Arena accepted", async () => {
  const stub = await startArenaStub();
  try {
    const transport = new HttpArenaTransport({ baseUrl: stub.baseUrl });
    const escalation = fixtureEscalationRecord();
    await transport.submit({ escalation, contextRefs: [...CONTEXT_REFS] });
    await transport.submit({ escalation, contextRefs: [...CONTEXT_REFS] });
    assert.equal(stub.requests.filter((request) => request.method === "POST").length, 1);
  } finally {
    await stub.close();
  }
});

test("baseUrl normalization: with and without a trailing slash both POST /escalations", async () => {
  const stub = await startArenaStub();
  try {
    const first = fixtureEscalationRecord();
    const second = { ...fixtureEscalationRecord(), escalationId: "esc:fixture-0000000000000001" };
    const bare = new HttpArenaTransport({ baseUrl: stub.baseUrl });
    const slashed = new HttpArenaTransport({ baseUrl: `${stub.baseUrl}/` });
    await bare.submit({ escalation: first, contextRefs: [...CONTEXT_REFS] });
    await slashed.submit({ escalation: second, contextRefs: [...CONTEXT_REFS] });
    const posts = stub.requests.filter((request) => request.method === "POST");
    assert.equal(posts.length, 2);
    assert.equal(posts[0]?.path, "/escalations");
    assert.equal(posts[1]?.path, "/escalations");
  } finally {
    await stub.close();
  }
});

test("status is null for an escalation the Arena does not know (404)", async () => {
  const stub = await startArenaStub();
  try {
    const transport = new HttpArenaTransport({ baseUrl: stub.baseUrl });
    assert.equal(await transport.status("esc:never-submitted"), null);
  } finally {
    await stub.close();
  }
});

test("status parses lifecycle and result into the typed contract shape", async () => {
  const escalation = fixtureEscalationRecord();
  const result = {
    resultId: `res:${escalation.escalationId}`,
    escalationId: escalation.escalationId,
    resultType: "solution",
    payloadHash: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    validated: false,
    learningArtifactRefs: ["learn:arena:fixture:1"],
    provenance: {
      sourceKind: "arena-session",
      sourceRef: escalation.escalationId,
      capturedAt: "2026-01-01T00:00:00.000Z",
      confidence: 0.9,
    },
  };
  const stub = await startArenaStub({ lifecycle: "submitted", result });
  try {
    const transport = new HttpArenaTransport({ baseUrl: stub.baseUrl });
    await transport.submit({ escalation, contextRefs: [...CONTEXT_REFS] });
    assert.deepEqual(await transport.status(escalation.escalationId), {
      lifecycle: "submitted",
      result,
    });
  } finally {
    await stub.close();
  }
});

test("status parses a legal result without optional confidence", async () => {
  const escalation = fixtureEscalationRecord();
  const result = {
    resultId: `res:${escalation.escalationId}`,
    escalationId: escalation.escalationId,
    resultType: "unblock",
    payloadHash: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    validated: false,
    learningArtifactRefs: [],
    provenance: {
      sourceKind: "agent-run",
      sourceRef: escalation.escalationId,
      capturedAt: "2026-01-01T00:00:00.000Z",
    },
  };
  const stub = await startArenaStub({ lifecycle: "validating", result });
  try {
    const transport = new HttpArenaTransport({ baseUrl: stub.baseUrl });
    await transport.submit({ escalation, contextRefs: [...CONTEXT_REFS] });
    assert.deepEqual(await transport.status(escalation.escalationId), {
      lifecycle: "validating",
      result,
    });
  } finally {
    await stub.close();
  }
});

test("status rejects an illegal lifecycle string at the boundary (validate-before-apply)", async () => {
  const escalation = fixtureEscalationRecord();
  const stub = await startArenaStub({ lifecycle: "bogus" });
  try {
    const transport = new HttpArenaTransport({ baseUrl: stub.baseUrl });
    await transport.submit({ escalation, contextRefs: [...CONTEXT_REFS] });
    await assert.rejects(
      () => transport.status(escalation.escalationId),
      expectTransportError("validation_error", /not a legal escalation lifecycle/),
    );
  } finally {
    await stub.close();
  }
});

test("status rejects an unknown resultType string at the boundary", async () => {
  const escalation = fixtureEscalationRecord();
  const result = {
    resultId: `res:${escalation.escalationId}`,
    escalationId: escalation.escalationId,
    resultType: "magic",
    payloadHash: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    validated: false,
    learningArtifactRefs: [],
    provenance: {
      sourceKind: "arena-session",
      sourceRef: escalation.escalationId,
      capturedAt: "2026-01-01T00:00:00.000Z",
    },
  };
  const stub = await startArenaStub({ lifecycle: "submitted", result });
  try {
    const transport = new HttpArenaTransport({ baseUrl: stub.baseUrl });
    await transport.submit({ escalation, contextRefs: [...CONTEXT_REFS] });
    await assert.rejects(
      () => transport.status(escalation.escalationId),
      expectTransportError("validation_error", /not a legal arena result type/),
    );
  } finally {
    await stub.close();
  }
});

test("status rejects an unknown provenance sourceKind string at the boundary", async () => {
  const escalation = fixtureEscalationRecord();
  const result = {
    resultId: `res:${escalation.escalationId}`,
    escalationId: escalation.escalationId,
    resultType: "solution",
    payloadHash: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    validated: false,
    learningArtifactRefs: [],
    provenance: {
      sourceKind: "daydream",
      sourceRef: escalation.escalationId,
      capturedAt: "2026-01-01T00:00:00.000Z",
    },
  };
  const stub = await startArenaStub({ lifecycle: "submitted", result });
  try {
    const transport = new HttpArenaTransport({ baseUrl: stub.baseUrl });
    await transport.submit({ escalation, contextRefs: [...CONTEXT_REFS] });
    await assert.rejects(
      () => transport.status(escalation.escalationId),
      expectTransportError("validation_error", /not a legal provenance kind/),
    );
  } finally {
    await stub.close();
  }
});

test("status rejects a malformed result record at the boundary", async () => {
  const escalation = fixtureEscalationRecord();
  const stub = await startArenaStub({
    lifecycle: "submitted",
    result: { resultId: "res:x", resultType: "solution" },
  });
  try {
    const transport = new HttpArenaTransport({ baseUrl: stub.baseUrl });
    await transport.submit({ escalation, contextRefs: [...CONTEXT_REFS] });
    await assert.rejects(
      () => transport.status(escalation.escalationId),
      expectTransportError("validation_error", /missing or invalid/),
    );
  } finally {
    await stub.close();
  }
});

test("status maps a non-2xx Arena response to a typed http_error", async () => {
  const stub = await startArenaStub({ getStatus: 500 });
  try {
    const transport = new HttpArenaTransport({ baseUrl: stub.baseUrl });
    await assert.rejects(
      () => transport.status("esc:anything"),
      expectTransportError("http_error"),
    );
    // carried status code for retry/telemetry decisions
    await assert.rejects(() => transport.status("esc:anything"), (error: unknown) => {
      assert.ok(error instanceof ArenaTransportError);
      assert.equal(error.statusCode, 500);
      return true;
    });
  } finally {
    await stub.close();
  }
});

test("submit maps a non-2xx Arena response to a typed http_error", async () => {
  const stub = await startArenaStub({ submitStatus: 500 });
  try {
    const transport = new HttpArenaTransport({ baseUrl: stub.baseUrl });
    await assert.rejects(
      () => transport.submit({ escalation: fixtureEscalationRecord(), contextRefs: [...CONTEXT_REFS] }),
      expectTransportError("http_error"),
    );
  } finally {
    await stub.close();
  }
});

test("submit rejects an Arena echo that jumps the lifecycle", async () => {
  const stub = await startArenaStub({ submitLifecycle: "closed" });
  try {
    const transport = new HttpArenaTransport({ baseUrl: stub.baseUrl });
    await assert.rejects(
      () => transport.submit({ escalation: fixtureEscalationRecord(), contextRefs: [...CONTEXT_REFS] }),
      expectTransportError("validation_error", /illegal lifecycle transition to closed/),
    );
  } finally {
    await stub.close();
  }
});

test("a slow Arena maps to timeout_error (real abort, real clock)", async () => {
  const stub = await startSlowArena(200);
  try {
    const transport = new HttpArenaTransport({ baseUrl: stub.baseUrl, timeout: 50 });
    await assert.rejects(
      () => transport.status(fixtureEscalationRecord().escalationId),
      expectTransportError("timeout_error"),
    );
    await assert.rejects(
      () => transport.submit({ escalation: fixtureEscalationRecord(), contextRefs: [...CONTEXT_REFS] }),
      expectTransportError("timeout_error"),
    );
  } finally {
    await stub.close();
  }
});

test("an unreachable Arena maps to network_error", async () => {
  const port = await closedPort();
  const transport = new HttpArenaTransport({ baseUrl: `http://localhost:${port}` });
  await assert.rejects(
    () => transport.status(fixtureEscalationRecord().escalationId),
    expectTransportError("network_error"),
  );
  await assert.rejects(
    () => transport.submit({ escalation: fixtureEscalationRecord(), contextRefs: [...CONTEXT_REFS] }),
    expectTransportError("network_error"),
  );
});

test("the authorization header crosses the wire when configured", async () => {
  const stub = await startArenaStub();
  try {
    const transport = new HttpArenaTransport({
      baseUrl: stub.baseUrl,
      authorization: "Bearer test-token",
    });
    await transport.submit({ escalation: fixtureEscalationRecord(), contextRefs: [...CONTEXT_REFS] });
    const post = stub.requests.find((request) => request.method === "POST");
    assert.equal(post?.headers.authorization, "Bearer test-token");
  } finally {
    await stub.close();
  }
});

test("no authorization header is sent when none is configured", async () => {
  const stub = await startArenaStub();
  try {
    const transport = new HttpArenaTransport({ baseUrl: stub.baseUrl });
    await transport.submit({ escalation: fixtureEscalationRecord(), contextRefs: [...CONTEXT_REFS] });
    const post = stub.requests.find((request) => request.method === "POST");
    assert.equal(post?.headers.authorization, undefined);
  } finally {
    await stub.close();
  }
});

test("custom headers cross the wire", async () => {
  const stub = await startArenaStub();
  try {
    const transport = new HttpArenaTransport({
      baseUrl: stub.baseUrl,
      headers: { "X-Custom-Header": "test-value" },
    });
    await transport.submit({ escalation: fixtureEscalationRecord(), contextRefs: [...CONTEXT_REFS] });
    const post = stub.requests.find((request) => request.method === "POST");
    assert.equal(post?.headers["x-custom-header"], "test-value");
  } finally {
    await stub.close();
  }
});
