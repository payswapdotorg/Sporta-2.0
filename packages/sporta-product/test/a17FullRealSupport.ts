/**
 * Support doubles for the A17 full-real loop test
 * (packages/sporta-product/test/a17-full-real.test.ts).
 *
 * EVIDENCE CLASS, per double (honest labeling — the test header restates it):
 *
 * 1. `StubArenaRole` — a REAL node:http TCP server on an ephemeral
 *    localhost port speaking the Arena HTTP contract (POST /escalations,
 *    GET /escalations/:id). The SOCKETS, REQUESTS and RESPONSES are real;
 *    the Arena ROLE behind the server (the expert session and its
 *    lifecycle advancement) is fixture-scripted by the test, exactly like
 *    the W2 httpArenaTransport test pattern. When its lifecycle passes
 *    validating -> accepted_result, the stub flips the result record's
 *    `validated` flag to true — that is the ARENA-side validation gate
 *    (the lifecycle's own meaning), NOT Sporta-side validation; the
 *    Sporta verdict (ArenaClientService.validateResult) is computed and
 *    asserted separately in the test.
 *
 * 2. `EditorSessionHistoryTrace` — a test-local implementation of the
 *    frozen `EditorSessionHistoryReadPort` shape reflecting the REAL
 *    EditorBrokerService sessions the test opens (worker-b's wave-3 lane
 *    owns the sporta-editors implementation; v1's broker has no close
 *    API, so sessions stay open — the test derives done-ness from real
 *    reconciled revisions, not from a fabricated closedAt).
 *
 * 3. `OrganizationCandidateTrace` — a test-local implementation of the
 *    frozen `OrganizationCandidateReadPort` shape reflecting the REAL
 *    OrganizationRegistryService drafts and promotions the test drives
 *    (worker-a's wave-3 lane owns the sporta-lab/evaluation
 *    implementation).
 */
import { createHash } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type {
  EditorSessionHistoryQuery,
  EditorSessionRecord,
  EditorSessionSummary,
  OrganizationCandidateQuery,
  OrganizationCandidateSummary,
  OrganizationVersionRecord,
  PromotionRecord,
  PromotionSummary,
} from "@sporta/contracts/contract";

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

/** Test-local editor-session history seam over the real broker's sessions. */
export class EditorSessionHistoryTrace {
  readonly #sessions: EditorSessionSummary[] = [];

  /** Record one session the REAL broker just opened. */
  record(session: EditorSessionRecord): void {
    this.#sessions.push({
      editorSessionId: session.editorSessionId,
      editorId: session.editorId,
      revisionId: session.revisionId,
      mode: session.mode,
      integrationLevel: session.integrationLevel,
      openedAt: session.openedAt,
      ...(session.closedAt === undefined ? {} : { closedAt: session.closedAt }),
    });
  }

  async listEditorSessions(
    query: EditorSessionHistoryQuery,
  ): Promise<readonly EditorSessionSummary[]> {
    let out = this.#sessions;
    if (query.editorSessionId !== undefined) {
      out = out.filter((session) => session.editorSessionId === query.editorSessionId);
    }
    if (query.revisionId !== undefined) {
      out = out.filter((session) => session.revisionId === query.revisionId);
    }
    if (query.openOnly === true) {
      out = out.filter((session) => session.closedAt === undefined);
    }
    return out.slice(0, query.limit ?? 50);
  }
}

/** Test-local organization candidate seam over the real registry's events. */
export class OrganizationCandidateTrace {
  readonly #candidates = new Map<string, OrganizationCandidateSummary>();
  readonly #promotions: PromotionSummary[] = [];

  /** Record a draft the REAL registry just accepted (registry candidate-id scheme). */
  draftRegistered(record: OrganizationVersionRecord, basis: string): void {
    const candidateId = `${record.organizationId}:${record.version}`;
    this.#candidates.set(candidateId, {
      candidateId,
      organizationId: record.organizationId,
      version: record.version,
      status: "candidate",
      basis,
    });
  }

  /** Record a promotion the REAL registry just decided (real PromotionRecord). */
  promoted(record: PromotionRecord): void {
    const existing = this.#candidates.get(record.candidateId);
    if (existing !== undefined && record.decision === "promoted") {
      this.#candidates.set(record.candidateId, { ...existing, status: "promoted" });
    }
    this.#promotions.push({
      promotionId: record.promotionId,
      candidateId: record.candidateId,
      decision: record.decision,
      decidedAt: record.decidedAt,
    });
  }

  async listOrganizationCandidates(
    query: OrganizationCandidateQuery,
  ): Promise<readonly OrganizationCandidateSummary[]> {
    let out = [...this.#candidates.values()];
    if (query.organizationId !== undefined) {
      out = out.filter((candidate) => candidate.organizationId === query.organizationId);
    }
    if (query.candidateId !== undefined) {
      out = out.filter((candidate) => candidate.candidateId === query.candidateId);
    }
    if (query.status !== undefined) {
      out = out.filter((candidate) => candidate.status === query.status);
    }
    return out.slice(0, query.limit ?? 50);
  }

  async listPromotions(query: OrganizationCandidateQuery): Promise<readonly PromotionSummary[]> {
    let out = this.#promotions;
    if (query.organizationId !== undefined) {
      const prefix = `${query.organizationId}:`;
      out = out.filter((promotion) => promotion.candidateId.startsWith(prefix));
    }
    return out.slice(0, query.limit ?? 50);
  }
}
