import assert from "node:assert/strict";
import { test } from "node:test";
import {
  EDITOR_SESSION_HISTORY_DEFAULT_LIMIT,
  EDITOR_SESSION_HISTORY_MAX_LIMIT,
  EditorBrokerService,
  EditorSessionHistoryQueryError,
  EditorSessionHistoryService,
  FixedClock,
  InMemoryEditorSessionHistoryStore,
  InMemoryEditorSessionStore,
  KdenliveFixtureAdapter,
  MysteryAppFixtureAdapter,
  UnknownEditorSessionError,
  resolveEditorSessionHistoryLimit,
  sessionVisibleToUsage,
  sha256EditorHash,
} from "../src/contract.js";
import { ArtifactGraphService } from "@sporta/artifacts/contract";
import type {
  EditorSessionHistoryReadPort,
  EditorSessionRecord,
  PolicySet,
  ProvenanceDescriptor,
} from "@sporta/contracts/contract";
import type { EditorBrokerDeps } from "../src/contract.js";

/**
 * W3B-1 — the editor-session history read seam (ADR:
 * docs/architecture/adr-wave3-read-seams.md). The port shape is the
 * frozen contracts `EditorSessionHistoryReadPort`; this package's
 * additive input carries the caller's usage context. The invariant-22
 * read gate is exercised end-to-end through the broker wiring, and the
 * gate law itself is unit-tested on the pure function.
 */

const policy: PolicySet = {
  rights: { holders: ["holder:history"], usages: ["render", "edit"], prohibitions: [] },
  privacy: { visibility: "tenant", exportableFields: [] },
  retention: { disposition: "retain" },
};

const renderOnlyWithDeriveProhibition: PolicySet = {
  rights: {
    holders: ["holder:history"],
    usages: ["render"],
    prohibitions: ["derive"],
  },
  privacy: { visibility: "tenant", exportableFields: [] },
  retention: { disposition: "retain" },
};

const provenance: ProvenanceDescriptor = {
  sourceKind: "agent-run",
  sourceRef: "run:history",
  capturedAt: "2026-01-01T00:00:00.000Z",
};

function fixtureWiring(): {
  broker: EditorBrokerService;
  artifacts: ArtifactGraphService;
  sessionStore: InMemoryEditorSessionStore;
  history: InMemoryEditorSessionHistoryStore;
  reads: EditorSessionHistoryService;
} {
  const artifacts = new ArtifactGraphService(new FixedClock("2026-03-01T00:00:00.000Z"));
  const sessionStore = new InMemoryEditorSessionStore();
  const history = new InMemoryEditorSessionHistoryStore();
  const deps: EditorBrokerDeps = {
    clock: new FixedClock("2026-03-02T00:00:00.000Z"),
    hash: sha256EditorHash,
    artifactGraph: artifacts,
    sessionStore,
    adapters: [new KdenliveFixtureAdapter(sha256EditorHash), new MysteryAppFixtureAdapter()],
    sessionHistory: history,
  };
  return {
    broker: new EditorBrokerService(deps),
    artifacts,
    sessionStore,
    history,
    reads: new EditorSessionHistoryService({ history }),
  };
}

async function seedRevision(artifacts: ArtifactGraphService, revisionId: string): Promise<string> {
  const artifactId = `art:${revisionId}`;
  await artifacts.recordArtifact({
    artifactId,
    kind: "tactical-board-video",
    editability: "editable",
    policy,
  });
  const revision = await artifacts.commitRevision({
    artifactId,
    revisionId,
    contentHash: sha256EditorHash(revisionId),
    toolVersions: ["sporta-render@0"],
    provenance,
    policy,
  });
  return revision.revisionId;
}

function historyRecord(
  editorSessionId: string,
  openedAt: string,
  recordPolicy: PolicySet = policy,
  revisionId = "rev:history-1",
): EditorSessionRecord {
  return {
    editorSessionId,
    editorId: "kdenlive",
    revisionId,
    mode: "local",
    integrationLevel: 2,
    openedAt,
    policy: recordPolicy,
  };
}

test("the service satisfies the frozen contracts port shape and fail-closes a bare query", async () => {
  const { reads } = fixtureWiring();
  // Type-level: the additive-input service IS an EditorSessionHistoryReadPort.
  const port: EditorSessionHistoryReadPort = reads;
  // A bare contracts query (no usage context) lists nothing: the gate
  // cannot affirm any permission, so the seam refuses by emptiness —
  // never by error (a read seam, not an authorization oracle).
  assert.deepEqual(await port.listEditorSessions({}), []);
  assert.deepEqual(await port.listEditorSessions({ openOnly: true }), []);
});

test("listEditorSessions returns summaries field-for-field with the session records (no policy leak)", async () => {
  const { broker, artifacts, reads } = fixtureWiring();
  const revisionId = await seedRevision(artifacts, "rev:history-1");
  const first = await broker.openSession({
    revisionId,
    editorId: "kdenlive",
    mode: "local",
    policy,
    editorSessionId: "es:history-1",
  });
  const second = await broker.openSession({
    revisionId,
    editorId: "kdenlive",
    mode: "remote",
    policy,
    editorSessionId: "es:history-2",
  });

  const summaries = await reads.listEditorSessions({ usage: { usages: ["render"] } });
  assert.equal(summaries.length, 2);
  const byId = new Map(summaries.map((summary) => [summary.editorSessionId, summary]));
  // Field-for-field with EditorSessionRecord — exactly the authoritative
  // summary shape, supersets are not needed and policy never leaks.
  assert.deepEqual(byId.get("es:history-1"), {
    editorSessionId: first.editorSessionId,
    editorId: "kdenlive",
    revisionId,
    mode: "local",
    integrationLevel: 2,
    openedAt: "2026-03-02T00:00:00.000Z",
  });
  assert.deepEqual(byId.get("es:history-2"), {
    editorSessionId: second.editorSessionId,
    editorId: "kdenlive",
    revisionId,
    mode: "remote",
    integrationLevel: 2,
    openedAt: "2026-03-02T00:00:00.000Z",
  });
  for (const summary of summaries) {
    // Exactly the authoritative summary fields — never fewer, and the
    // session's PolicySet never leaks through the read seam.
    assert.deepEqual(Object.keys(summary).sort(), [
      "editorId",
      "editorSessionId",
      "integrationLevel",
      "mode",
      "openedAt",
      "revisionId",
    ]);
  }
});

test("broker appends opened sessions to the history; idempotent re-open does not duplicate", async () => {
  const { broker, artifacts, history, reads } = fixtureWiring();
  const revisionId = await seedRevision(artifacts, "rev:history-1");
  const session = await broker.openSession({
    revisionId,
    editorId: "kdenlive",
    mode: "local",
    policy,
    editorSessionId: "es:history-1",
  });
  // Retry with different fields: first write wins, and the projection
  // keeps exactly one record for the session id.
  await broker.openSession({
    revisionId,
    editorId: "kdenlive",
    mode: "external",
    policy,
    editorSessionId: "es:history-1",
  });
  const stored = await history.list({ limit: 10 });
  assert.equal(stored.length, 1);
  assert.equal(stored[0]?.mode, "local");
  const summaries = await reads.listEditorSessions({ usage: { usages: ["render"] } });
  assert.equal(summaries.length, 1);
  assert.equal(summaries[0]?.editorSessionId, session.editorSessionId);
});

test("re-opening self-heals a history projection that missed the original append", async () => {
  const artifacts = new ArtifactGraphService(new FixedClock("2026-03-01T00:00:00.000Z"));
  const sessionStore = new InMemoryEditorSessionStore();
  const history = new InMemoryEditorSessionHistoryStore();
  const revisionId = await seedRevision(artifacts, "rev:history-1");

  // First broker wiring has NO history projection (the optional dep is absent).
  const withoutHistory = new EditorBrokerService({
    clock: new FixedClock("2026-03-02T00:00:00.000Z"),
    hash: sha256EditorHash,
    artifactGraph: artifacts,
    sessionStore,
    adapters: [new KdenliveFixtureAdapter(sha256EditorHash)],
  } satisfies EditorBrokerDeps);
  await withoutHistory.openSession({
    revisionId,
    editorId: "kdenlive",
    mode: "local",
    policy,
    editorSessionId: "es:heal-1",
  });
  assert.deepEqual(await history.list({ limit: 10 }), []);

  // A later wiring over the SAME session store gains the projection; the
  // idempotent re-open appends the existing record and heals the history.
  const withHistory = new EditorBrokerService({
    clock: new FixedClock("2026-03-03T00:00:00.000Z"),
    hash: sha256EditorHash,
    artifactGraph: artifacts,
    sessionStore,
    adapters: [new KdenliveFixtureAdapter(sha256EditorHash)],
    sessionHistory: history,
  } satisfies EditorBrokerDeps);
  const healed = await withHistory.openSession({
    revisionId,
    editorId: "kdenlive",
    mode: "local",
    policy,
    editorSessionId: "es:heal-1",
  });
  assert.equal(healed.openedAt, "2026-03-02T00:00:00.000Z"); // first write wins
  const reads = new EditorSessionHistoryService({ history });
  const summaries = await reads.listEditorSessions({ usage: { usages: ["render"] } });
  assert.equal(summaries.length, 1);
  assert.equal(summaries[0]?.editorSessionId, "es:heal-1");
});

test("structural filters: revisionId, editorSessionId and openOnly narrow the listing", async () => {
  const { broker, artifacts, history, reads } = fixtureWiring();
  const revisionA = await seedRevision(artifacts, "rev:history-1");
  const revisionB = await seedRevision(artifacts, "rev:history-2");
  await broker.openSession({
    revisionId: revisionA,
    editorId: "kdenlive",
    mode: "local",
    policy,
    editorSessionId: "es:filter-1",
  });
  await broker.openSession({
    revisionId: revisionA,
    editorId: "kdenlive",
    mode: "remote",
    policy,
    editorSessionId: "es:filter-2",
  });
  await broker.openSession({
    revisionId: revisionB,
    editorId: "kdenlive",
    mode: "local",
    policy,
    editorSessionId: "es:filter-3",
  });
  await history.close("es:filter-2", "2026-03-04T00:00:00.000Z");

  const usage = { usages: ["render"] } as const;
  const byRevisionA = await reads.listEditorSessions({ revisionId: revisionA, usage });
  assert.deepEqual(
    byRevisionA.map((summary) => summary.editorSessionId),
    ["es:filter-2", "es:filter-1"], // newest first
  );
  const pinned = await reads.listEditorSessions({ editorSessionId: "es:filter-3", usage });
  assert.deepEqual(
    pinned.map((summary) => summary.editorSessionId),
    ["es:filter-3"],
  );
  const open = await reads.listEditorSessions({ openOnly: true, usage });
  assert.deepEqual(
    open.map((summary) => summary.editorSessionId),
    ["es:filter-3", "es:filter-1"],
  );
  // The closed session surfaces its closedAt through the summary.
  const closed = await reads.listEditorSessions({ revisionId: revisionA, usage });
  assert.equal(closed[0]?.closedAt, "2026-03-04T00:00:00.000Z");
});

test("close is first-close-wins and unknown sessions are a typed refusal", async () => {
  const { history } = fixtureWiring();
  await history.append(historyRecord("es:close-1", "2026-03-02T00:00:00.000Z"));
  const first = await history.close("es:close-1", "2026-03-04T00:00:00.000Z");
  assert.equal(first.closedAt, "2026-03-04T00:00:00.000Z");
  const second = await history.close("es:close-1", "2026-03-09T00:00:00.000Z");
  assert.equal(second.closedAt, "2026-03-04T00:00:00.000Z"); // first close wins
  await assert.rejects(
    () => history.close("es:missing", "2026-03-04T00:00:00.000Z"),
    (error: unknown) => {
      assert.ok(error instanceof UnknownEditorSessionError);
      assert.equal(
        (error as UnknownEditorSessionError).detail,
        "unknown-editor-session:es:missing",
      );
      return true;
    },
  );
});

test("rights gate: permitted callers list, prohibited usages are absent — never an error", async () => {
  const history = new InMemoryEditorSessionHistoryStore();
  await history.append(historyRecord("es:rights-1", "2026-03-02T00:00:00.000Z", policy));
  await history.append(
    historyRecord("es:rights-2", "2026-03-02T00:01:00.000Z", renderOnlyWithDeriveProhibition),
  );
  const reads = new EditorSessionHistoryService({ history });

  // A render-permitted caller sees both sessions (render is permitted on both).
  const render = await reads.listEditorSessions({ usage: { usages: ["render"] } });
  assert.deepEqual(
    render.map((summary) => summary.editorSessionId),
    ["es:rights-2", "es:rights-1"],
  );
  // An edit caller sees only the session whose rights permit edit.
  const edit = await reads.listEditorSessions({ usage: { usages: ["edit"] } });
  assert.deepEqual(
    edit.map((summary) => summary.editorSessionId),
    ["es:rights-1"],
  );
  // A derive caller hits a prohibition on one session and simple
  // non-permission on the other: honest absence for both, no error.
  const derive = await reads.listEditorSessions({ usage: { usages: ["derive"] } });
  assert.deepEqual(derive, []);
  // A mixed context (render + derive) is a whole: the prohibition on
  // es:rights-2 hides it; es:rights-1 (no prohibitions) stays visible.
  const mixed = await reads.listEditorSessions({ usage: { usages: ["render", "derive"] } });
  assert.deepEqual(
    mixed.map((summary) => summary.editorSessionId),
    ["es:rights-1"],
  );
  // Fail-closed: empty usage context and missing usage context list nothing.
  assert.deepEqual(await reads.listEditorSessions({ usage: { usages: [] } }), []);
  assert.deepEqual(await reads.listEditorSessions({}), []);
});

test("sessionVisibleToUsage: the pure invariant-22 gate law", () => {
  const rights = { holders: ["h"], usages: ["render", "edit"], prohibitions: ["derive"] };
  assert.equal(sessionVisibleToUsage(rights, { usages: ["render"] }), true);
  assert.equal(sessionVisibleToUsage(rights, { usages: ["edit"] }), true);
  assert.equal(sessionVisibleToUsage(rights, { usages: ["render", "edit"] }), true);
  assert.equal(sessionVisibleToUsage(rights, { usages: ["derive"] }), false); // prohibited
  assert.equal(sessionVisibleToUsage(rights, { usages: ["render", "derive"] }), false); // any prohibition hides
  assert.equal(sessionVisibleToUsage(rights, { usages: ["compute"] }), false); // not permitted
  assert.equal(sessionVisibleToUsage(rights, { usages: [] }), false); // fail-closed
  assert.equal(sessionVisibleToUsage(rights, undefined), false); // fail-closed
});

test("bounded reads: default page 50, explicit limits honored, newest first", async () => {
  const history = new InMemoryEditorSessionHistoryStore();
  for (let index = 1; index <= 55; index += 1) {
    await history.append(
      historyRecord(
        `es:page-${index}`,
        new Date(Date.parse("2026-03-02T00:00:00.000Z") + index * 1000).toISOString(),
      ),
    );
  }
  const reads = new EditorSessionHistoryService({ history });
  const usage = { usages: ["render"] } as const;

  // No limit: the default page (50) of the 55 appended sessions.
  const defaultPage = await reads.listEditorSessions({ usage });
  assert.equal(defaultPage.length, EDITOR_SESSION_HISTORY_DEFAULT_LIMIT);
  assert.equal(defaultPage[0]?.editorSessionId, "es:page-55"); // newest first
  assert.equal(defaultPage[49]?.editorSessionId, "es:page-6"); // oldest on the page
  // An explicit smaller limit is honored.
  const small = await reads.listEditorSessions({ usage, limit: 10 });
  assert.equal(small.length, 10);
  assert.equal(small[0]?.editorSessionId, "es:page-55");
  // The limit law resolves defaults, caps and refuses malformed values.
  assert.equal(resolveEditorSessionHistoryLimit(undefined), 50);
  assert.equal(resolveEditorSessionHistoryLimit(500), 500);
  assert.equal(resolveEditorSessionHistoryLimit(10_000), EDITOR_SESSION_HISTORY_MAX_LIMIT);
  for (const malformed of [0, -1, 1.5, Number.NaN]) {
    assert.throws(
      () => resolveEditorSessionHistoryLimit(malformed),
      (error: unknown) => error instanceof EditorSessionHistoryQueryError,
      `expected typed refusal for limit ${malformed}`,
    );
  }
});

test("malformed limits surface as typed EditorSessionHistoryQueryError from the service", async () => {
  const { reads } = fixtureWiring();
  await assert.rejects(
    () => reads.listEditorSessions({ usage: { usages: ["render"] }, limit: 0 }),
    (error: unknown) => {
      assert.ok(error instanceof EditorSessionHistoryQueryError);
      assert.equal((error as EditorSessionHistoryQueryError).detail, "history-query:0");
      return true;
    },
  );
});
