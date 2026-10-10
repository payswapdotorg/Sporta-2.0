/**
 * W4C-2 C6 rights-propagation tests for the arena read plane
 * (invariant 22 — ADR: docs/architecture/adr-wave4-c6-host.md).
 *
 * EVIDENCE CLASSES (labeled per section, honestly):
 * - Section 1 (pure gate): FIXTURE/pure — the gate is a pure function;
 *   these tests prove its law, mirroring the W3-B editors' gate tests.
 * - Section 2 (service, in-memory lane): FIXTURE — the ArenaClientService
 *   logic under test is production code; InMemoryArenaTransport is a
 *   fixture-grade double.
 * - Section 3 (REAL HTTP lane): REAL for the transport — every escalate /
 *   status call drives the real HttpArenaTransport over a real local
 *   node:http server (ephemeral port, real sockets, real fetch, real
 *   status codes). The Arena role behind the server is fixture-scripted
 *   (canned results), so the EXPERT SESSION is not real — the HTTP
 *   boundary and the gate's placement BEFORE it are.
 *
 * Project law: node:test + tsx only — no describe/it/expect globals.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { EscalationReadPort, PolicySet, RightsScope } from "@sporta/contracts/contract";
import {
  ArenaClientService,
  ArenaReadRefusalError,
  InMemoryArenaTransport,
  HttpArenaTransport,
  arenaPolicyPermitsUsage,
  arenaRecordVisibleToUsage,
} from "../src/contract.js";
import type { ArenaReadUsageContext } from "../src/contract.js";
import { fixtureEscalateInput, fixtureGapInput } from "./fixtures.js";

// ---------------------------------------------------------------------------
// Section 1: the pure gate (fixture/pure evidence — the gate's law).
// ---------------------------------------------------------------------------

function rights(overrides: Partial<RightsScope> = {}): RightsScope {
  return { holders: ["holder:x"], usages: ["render"], prohibitions: [], ...overrides };
}

test("pure gate: a permitted, un-prohibited usage is visible", () => {
  assert.equal(arenaRecordVisibleToUsage(rights(), { usages: ["render"] }), true);
});

test("pure gate: a usage the rights do not affirm is NOT visible (fail-closed)", () => {
  assert.equal(arenaRecordVisibleToUsage(rights(), { usages: ["edit"] }), false);
  assert.equal(
    arenaRecordVisibleToUsage(rights({ usages: ["edit"] }), { usages: ["render"] }),
    false,
  );
});

test("pure gate: any prohibited usage kills visibility, even alongside a permitted one", () => {
  assert.equal(
    arenaRecordVisibleToUsage(rights({ prohibitions: ["render"] }), { usages: ["render"] }),
    false,
  );
  assert.equal(
    arenaRecordVisibleToUsage(
      rights({ usages: ["render", "edit"], prohibitions: ["edit"] }),
      { usages: ["render", "edit"] },
    ),
    false,
  );
});

test("pure gate: at least one permitted usage with none prohibited is enough", () => {
  assert.equal(
    arenaRecordVisibleToUsage(rights({ usages: ["render", "edit"] }), {
      usages: ["edit", "derive"],
    }),
    true,
  );
});

test("pure gate: an empty usage context can affirm nothing (fail-closed)", () => {
  assert.equal(arenaRecordVisibleToUsage(rights(), { usages: [] }), false);
});

test("pure gate: the gate function itself returns false for an absent context (the service treats absent as gate-not-applied)", () => {
  assert.equal(arenaRecordVisibleToUsage(rights(), undefined), false);
});

test("pure gate over a full PolicySet: reads rights through the record's shape", () => {
  const policy: PolicySet = {
    rights: { holders: ["holder:p"], usages: ["render"], prohibitions: ["train"] },
    privacy: { visibility: "escalation", exportableFields: [] },
    retention: { disposition: "retain" },
  };
  assert.equal(arenaPolicyPermitsUsage(policy, { usages: ["render"] }), true);
  assert.equal(arenaPolicyPermitsUsage(policy, { usages: ["train"] }), false);
  assert.equal(arenaPolicyPermitsUsage(policy, { usages: ["render", "train"] }), false);
});

// ---------------------------------------------------------------------------
// Section 2: rights-gated reads on ArenaClientService (fixture lane).
// ---------------------------------------------------------------------------

/** A policy that permits exactly `usages` and prohibits exactly `prohibitions`. */
function policyFor(usages: readonly string[], prohibitions: readonly string[] = []): PolicySet {
  return {
    rights: { holders: ["holder:fixture"], usages: [...usages], prohibitions: [...prohibitions] },
    privacy: { visibility: "escalation", exportableFields: [] },
    retention: { disposition: "retain" },
  };
}

interface SeededLane {
  client: ArenaClientService;
  transport: InMemoryArenaTransport;
  renderId: string;
  prohibitedId: string;
}

/** Two escalations: one render-permitted, one render-prohibited (edit-only). */
async function seedLane(): Promise<SeededLane> {
  const transport = new InMemoryArenaTransport();
  const client = new ArenaClientService({ transport });
  await client.recordGap(fixtureGapInput({ gapId: "gap:render", workGraphId: "wg:gate" }));
  await client.recordGap(fixtureGapInput({ gapId: "gap:prohibited", workGraphId: "wg:gate" }));
  const render = await client.escalate(
    fixtureEscalateInput({
      idempotencyKey: "gate-render",
      gapId: "gap:render",
      policy: policyFor(["render"]),
    }),
  );
  const prohibited = await client.escalate(
    fixtureEscalateInput({
      idempotencyKey: "gate-prohibited",
      gapId: "gap:prohibited",
      policy: policyFor(["edit"], ["render"]),
    }),
  );
  // Produce a result on each escalation (fixture Arena: 12 steps → result).
  await transport.advance(render.escalationId, 12);
  await transport.advance(prohibited.escalationId, 12);
  return { client, transport, renderId: render.escalationId, prohibitedId: prohibited.escalationId };
}

test("fixture lane: the gated service still satisfies the frozen EscalationReadPort (additive)", () => {
  const client = new ArenaClientService({ transport: new InMemoryArenaTransport() });
  const seam: EscalationReadPort = client;
  assert.equal(typeof seam.listEscalations, "function");
  assert.equal(typeof seam.listResults, "function");
});

test("fixture lane: listEscalations with a usage context excludes prohibited records", async () => {
  const lane = await seedLane();
  const visible = await lane.client.listEscalations({ usage: { usages: ["render"] } });
  assert.deepEqual(
    visible.map((summary) => summary.escalationId),
    [lane.renderId],
  );
});

test("fixture lane: listEscalations with an empty usage context sees nothing (fail-closed)", async () => {
  const lane = await seedLane();
  assert.deepEqual(await lane.client.listEscalations({ usage: { usages: [] } }), []);
});

test("fixture lane: listEscalations without a usage context keeps the pre-wave-4 behavior (all records)", async () => {
  const lane = await seedLane();
  const all = await lane.client.listEscalations({});
  assert.deepEqual(
    all.map((summary) => summary.escalationId).sort(),
    [lane.renderId, lane.prohibitedId].sort(),
  );
});

test("fixture lane: listResults with a usage context excludes prohibited escalations' results", async () => {
  const lane = await seedLane();
  const visible = await lane.client.listResults({ usage: { usages: ["render"] } });
  assert.equal(visible.length, 1);
  assert.equal(visible[0]?.escalationId, lane.renderId);
});

test("fixture lane: listResults without a usage context keeps the pre-wave-4 behavior", async () => {
  const lane = await seedLane();
  const all = await lane.client.listResults({});
  assert.equal(all.length, 2);
});

test("fixture lane: a prohibited direct readResult is a TYPED refusal, never a silent null", async () => {
  const lane = await seedLane();
  await assert.rejects(
    lane.client.readResult(lane.prohibitedId, { usages: ["render"] }),
    (error: unknown) => {
      assert.ok(error instanceof ArenaReadRefusalError, "typed refusal expected");
      assert.equal(error.escalationId, lane.prohibitedId);
      assert.deepEqual(error.usages, ["render"]);
      return true;
    },
  );
  // A declared-but-unaffirmed usage refuses too (fail-closed).
  await assert.rejects(
    lane.client.readResult(lane.renderId, { usages: ["edit"] }),
    (error: unknown) => error instanceof ArenaReadRefusalError,
  );
});

test("fixture lane: an empty usage context on a direct read refuses (it can affirm nothing)", async () => {
  const lane = await seedLane();
  await assert.rejects(
    lane.client.readResult(lane.renderId, { usages: [] }),
    (error: unknown) => error instanceof ArenaReadRefusalError,
  );
});

test("fixture lane: a permitted direct readResult returns the result; absent usage keeps the baseline", async () => {
  const lane = await seedLane();
  const gated = await lane.client.readResult(lane.renderId, { usages: ["render"] });
  assert.ok(gated !== null, "permitted usage reads the result");
  const baseline = await lane.client.readResult(lane.renderId);
  assert.ok(baseline !== null, "absent usage keeps the pre-wave-4 behavior");
  assert.equal(gated.resultId, baseline.resultId);
});

test("fixture lane: unknown escalations stay null under a usage context (the gate only judges known records)", async () => {
  const lane = await seedLane();
  assert.equal(
    await lane.client.readResult("esc:unknown", { usages: ["render"] }),
    null,
  );
});

// ---------------------------------------------------------------------------
// Section 3: rights-gated reads on the REAL HTTP lane (REAL transport
// evidence; fixture-scripted Arena role behind a real local HTTP server).
// ---------------------------------------------------------------------------

interface HttpLaneRequest {
  method: string;
  path: string;
}

interface HttpLaneStub {
  baseUrl: string;
  requests: HttpLaneRequest[];
  close(): Promise<void>;
}

/**
 * A real local HTTP server (node:http, ephemeral port) speaking the W2
 * Arena wire protocol: POST /escalations records the escalation; GET
 * /escalations/:id answers 404 for unknown ids and a canned result for
 * known ones. The Arena ROLE is fixture-scripted; the HTTP boundary,
 * real fetch and real sockets are real.
 */
async function startHttpLaneStub(): Promise<HttpLaneStub> {
  const requests: HttpLaneRequest[] = [];
  const known = new Set<string>();
  const server: Server = createServer((req, res) => {
    void handle(req, res);
  });

  async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
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
    requests.push({ method, path: url.pathname });

    if (method === "POST" && url.pathname === "/escalations") {
      const parsed = body as { escalation?: { escalationId?: string } } | null;
      const escalationId = parsed?.escalation?.escalationId ?? "esc:unknown";
      known.add(escalationId);
      res.writeHead(201, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ escalationId, lifecycle: "triaged" }));
      return;
    }
    if (method === "GET" && url.pathname.startsWith("/escalations/")) {
      const escalationId = decodeURIComponent(url.pathname.slice("/escalations/".length));
      if (!known.has(escalationId)) {
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Not found" }));
        return;
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          lifecycle: "accepted_result",
          result: {
            resultId: `res:${escalationId}`,
            escalationId,
            resultType: "unblock",
            payloadHash: "f".repeat(64),
            validated: true,
            learningArtifactRefs: [],
            provenance: {
              sourceKind: "arena-session",
              sourceRef: `session:${escalationId}`,
              capturedAt: "2026-10-07T12:00:00.000Z",
            },
          },
        }),
      );
      return;
    }
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Not found" }));
  }

  await new Promise<void>((resolve) => server.listen(0, "localhost", resolve));
  const address = server.address();
  assert.ok(address !== null && typeof address === "object", "expected an ephemeral TCP port");
  const baseUrl = `http://localhost:${address.port}`;
  return {
    baseUrl,
    requests,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) reject(error);
          else resolve();
        });
      }),
  };
}

interface RealLane {
  client: ArenaClientService;
  stub: HttpLaneStub;
  renderId: string;
  prohibitedId: string;
}

/** Escalate two differently-policied records through the REAL HTTP transport. */
async function seedRealLane(stub: HttpLaneStub): Promise<Omit<RealLane, "stub">> {
  const client = new ArenaClientService({
    transport: new HttpArenaTransport({ baseUrl: stub.baseUrl }),
  });
  await client.recordGap(fixtureGapInput({ gapId: "gap:http-render", workGraphId: "wg:http" }));
  await client.recordGap(fixtureGapInput({ gapId: "gap:http-prohibited", workGraphId: "wg:http" }));
  const render = await client.escalate(
    fixtureEscalateInput({
      idempotencyKey: "http-render",
      gapId: "gap:http-render",
      policy: policyFor(["render"]),
    }),
  );
  const prohibited = await client.escalate(
    fixtureEscalateInput({
      idempotencyKey: "http-prohibited",
      gapId: "gap:http-prohibited",
      policy: policyFor(["edit"], ["render"]),
    }),
  );
  return { client, renderId: render.escalationId, prohibitedId: prohibited.escalationId };
}

test("REAL HTTP lane: listEscalations excludes prohibited records for a render caller", async (t) => {
  const stub = await startHttpLaneStub();
  t.after(() => void stub.close());
  const lane = await seedRealLane(stub);

  const visible = await lane.client.listEscalations({ usage: { usages: ["render"] } });
  assert.deepEqual(
    visible.map((summary) => summary.escalationId),
    [lane.renderId],
    "only the render-permitted escalation is listed",
  );

  // Baseline parity on the same lane: absent usage lists both.
  const all = await lane.client.listEscalations({});
  assert.equal(all.length, 2, "absent usage context keeps the pre-wave-4 behavior");
});

test("REAL HTTP lane: a prohibited direct read refuses BEFORE any HTTP request leaves the client", async (t) => {
  const stub = await startHttpLaneStub();
  t.after(() => void stub.close());
  const lane = await seedRealLane(stub);
  // The transport URL-encodes ids on the wire (esc:x -> esc%3Ax).
  const prohibitedPath = `/escalations/${encodeURIComponent(lane.prohibitedId)}`;
  const getsBefore = stub.requests.filter(
    (request) => request.method === "GET" && request.path === prohibitedPath,
  ).length;

  await assert.rejects(
    lane.client.readResult(lane.prohibitedId, { usages: ["render"] }),
    (error: unknown) => error instanceof ArenaReadRefusalError,
  );

  const getsAfter = stub.requests.filter(
    (request) => request.method === "GET" && request.path === prohibitedPath,
  ).length;
  assert.equal(getsAfter, getsBefore, "the refusal fires before the transport — no HTTP call");
});

test("REAL HTTP lane: a permitted direct read crosses the real HTTP boundary and returns the result", async (t) => {
  const stub = await startHttpLaneStub();
  t.after(() => void stub.close());
  const lane = await seedRealLane(stub);
  const renderPath = `/escalations/${encodeURIComponent(lane.renderId)}`;

  const result = await lane.client.readResult(lane.renderId, { usages: ["render"] });
  assert.ok(result !== null, "the permitted read reached the Arena over real HTTP");
  assert.equal(result.escalationId, lane.renderId);
  assert.ok(
    stub.requests.some((request) => request.method === "GET" && request.path === renderPath),
    "a real GET /escalations/:id was issued",
  );
});

test("REAL HTTP lane: listResults with a usage context returns only the permitted escalation's result", async (t) => {
  const stub = await startHttpLaneStub();
  t.after(() => void stub.close());
  const lane = await seedRealLane(stub);

  const visible = await lane.client.listResults({ usage: { usages: ["render"] } });
  assert.equal(visible.length, 1);
  assert.equal(visible[0]?.escalationId, lane.renderId);

  // Baseline parity on the same lane: absent usage lists both results.
  const all = await lane.client.listResults({});
  assert.equal(all.length, 2);
});

test("REAL HTTP lane: a usage context is honest across surfaces — refusals name the usage and the record", async (t) => {
  const stub = await startHttpLaneStub();
  t.after(() => void stub.close());
  const lane = await seedRealLane(stub);

  const usage: ArenaReadUsageContext = { usages: ["render"] };
  await assert.rejects(
    lane.client.readResult(lane.prohibitedId, usage),
    (error: unknown) => {
      assert.ok(error instanceof ArenaReadRefusalError);
      assert.equal(error.escalationId, lane.prohibitedId);
      assert.deepEqual(error.usages, ["render"]);
      assert.match(error.message, /invariant 22/);
      return true;
    },
  );
});
