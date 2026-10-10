import assert from "node:assert/strict";
import { test } from "node:test";
import {
  SharedSessionConflictError,
  SharedSessionOrderError,
  advanceCoordinationHead,
  broadcastSharedDelta,
  initialSharedSessionCoordination,
  sharedSessionLogIsOrdered,
  validateSharedSessionReconcile,
} from "../src/contract.js";
import type {
  ArtifactRevisionRecord,
  EditDeltaRecord,
  PolicySet,
  ProvenanceDescriptor,
} from "@sporta/contracts/contract";
import type { OrderedSharedDelta, SharedSessionCoordination } from "../src/contract.js";

/**
 * W6A pure-domain laws, part 2 — the coordination law (deterministic
 * total order over broadcast deltas: sequence monotonicity, idempotent
 * delivery, conflict-refusal with the divergent revision ids) and the
 * reconcile validation law. EVIDENCE CLASS: pure domain (no IO).
 */

const POLICY: PolicySet = {
  rights: { holders: ["holder:w6a"], usages: ["render", "edit"], prohibitions: [] },
  privacy: { visibility: "tenant", exportableFields: [] },
  retention: { disposition: "retain" },
};

const PROVENANCE: ProvenanceDescriptor = {
  sourceKind: "editor-session",
  sourceRef: "ss:1#es",
  capturedAt: "2026-10-01T00:00:00.000Z",
};

function delta(
  deltaId: string,
  participantId: string,
  baseRevisionId: string,
  operations: string[],
) {
  return { deltaId, participantId, baseRevisionId, operations };
}

function ordered(
  sequence: number,
  deltaId: string,
  participantId: string,
  baseRevisionId: string,
): OrderedSharedDelta {
  return {
    sequence,
    deltaId,
    participantId,
    baseRevisionId,
    operations: [`set /x/${deltaId}`],
    deliveredAt: "2026-10-01T00:00:00.000Z",
  };
}

function reconcileAt(
  revisionId: string,
  fromRevisionId: string,
): {
  revision: ArtifactRevisionRecord;
  delta: EditDeltaRecord;
} {
  return {
    revision: {
      revisionId,
      artifactId: "art:w6a",
      parentRevisionId: fromRevisionId,
      contentHash: "cd".repeat(32),
      toolVersions: ["kdenlive@24.08.0"],
      provenance: PROVENANCE,
      policy: POLICY,
    },
    delta: {
      deltaId: `delta:${revisionId}`,
      fromRevisionId,
      toRevisionId: revisionId,
      editor: "kdenlive",
      editorVersion: "24.08.0",
      operations: ["set /mlt/attributes/title"],
      provenance: PROVENANCE,
    },
  };
}

test("broadcast: sequences are contiguous ascending from 1 — the deterministic total order", () => {
  let state = initialSharedSessionCoordination("ss:1", "rev:r1");
  const first = broadcastSharedDelta(
    state,
    delta("sd:a", "user:a", "rev:r1", ["set /a"]),
    "2026-10-01T00:00:01.000Z",
  );
  const second = broadcastSharedDelta(
    first.coordination,
    delta("sd:b", "user:b", "rev:r1", ["set /b"]),
    "2026-10-01T00:00:02.000Z",
  );
  const third = broadcastSharedDelta(
    second.coordination,
    delta("sd:c", "user:a", "rev:r1", ["set /c"]),
    "2026-10-01T00:00:03.000Z",
  );
  state = third.coordination;
  assert.deepEqual(
    state.log.map((entry) => [entry.sequence, entry.deltaId, entry.participantId]),
    [
      [1, "sd:a", "user:a"],
      [2, "sd:b", "user:b"],
      [3, "sd:c", "user:a"],
    ],
  );
  assert.equal(state.lastSequence, 3);
  assert.equal(state.headRevisionId, "rev:r1"); // broadcasts never move the head
  assert.ok(sharedSessionLogIsOrdered(state.log));
});

test("broadcast: delivery is idempotent per delta id (log unchanged, entry returned)", () => {
  let state = initialSharedSessionCoordination("ss:1", "rev:r1");
  const first = broadcastSharedDelta(
    state,
    delta("sd:a", "user:a", "rev:r1", ["set /a"]),
    "2026-10-01T00:00:01.000Z",
  );
  state = first.coordination;
  const retry = broadcastSharedDelta(
    state,
    delta("sd:a", "user:a", "rev:r1", ["set /a"]),
    "2026-10-01T00:09:00.000Z",
  );
  assert.equal(retry.deduplicated, true);
  assert.deepEqual(retry.coordination, state); // log unchanged
  assert.deepEqual(retry.entry, first.entry); // the original entry returns
  assert.equal(state.lastSequence, 1);
});

test("broadcast: conflict-refusal carries BOTH divergent revision ids when the base is not the head", () => {
  const state = initialSharedSessionCoordination("ss:1", "rev:r1");
  assert.throws(
    () =>
      broadcastSharedDelta(
        state,
        delta("sd:stale", "user:a", "rev:r0", []),
        "2026-10-01T00:00:01.000Z",
      ),
    (error: unknown) => {
      assert.ok(error instanceof SharedSessionConflictError);
      assert.equal(error.sessionHeadRevisionId, "rev:r1");
      assert.equal(error.deltaBaseRevisionId, "rev:r0");
      assert.equal(error.detail, "shared-conflict:sessionHead=rev:r1:deltaBase=rev:r0");
      return true;
    },
  );
});

test("broadcast: idempotency wins over conflict — a delivered delta retries cleanly after the head moved", () => {
  let state = initialSharedSessionCoordination("ss:1", "rev:r1");
  const first = broadcastSharedDelta(
    state,
    delta("sd:a", "user:a", "rev:r1", ["set /a"]),
    "2026-10-01T00:00:01.000Z",
  );
  state = advanceCoordinationHead(first.coordination, "rev:r2");
  const retry = broadcastSharedDelta(
    state,
    delta("sd:a", "user:a", "rev:r1", ["set /a"]),
    "2026-10-01T00:09:00.000Z",
  );
  assert.equal(retry.deduplicated, true); // not a spurious conflict
});

test("broadcast: after the head advances (a save committed), stale-based deltas conflict with the divergent ids", () => {
  let state = initialSharedSessionCoordination("ss:1", "rev:r1");
  const first = broadcastSharedDelta(
    state,
    delta("sd:a", "user:a", "rev:r1", ["set /a"]),
    "2026-10-01T00:00:01.000Z",
  );
  state = advanceCoordinationHead(first.coordination, "rev:r2");
  assert.throws(
    () =>
      broadcastSharedDelta(
        state,
        delta("sd:b", "user:b", "rev:r1", ["set /b"]),
        "2026-10-01T00:02:00.000Z",
      ),
    (error: unknown) => {
      assert.ok(error instanceof SharedSessionConflictError);
      assert.equal(error.sessionHeadRevisionId, "rev:r2");
      assert.equal(error.deltaBaseRevisionId, "rev:r1");
      return true;
    },
  );
  // a delta based on the NEW head delivers
  const fresh = broadcastSharedDelta(
    state,
    delta("sd:c", "user:b", "rev:r2", ["set /c"]),
    "2026-10-01T00:03:00.000Z",
  );
  assert.equal(fresh.entry.sequence, 2);
  assert.equal(fresh.entry.baseRevisionId, "rev:r2");
});

test("log-order invariant: gapped, regressing, duplicated or forged logs are refused", () => {
  assert.ok(sharedSessionLogIsOrdered([]));
  assert.ok(
    sharedSessionLogIsOrdered([
      ordered(1, "sd:a", "u", "rev:r1"),
      ordered(2, "sd:b", "u", "rev:r1"),
    ]),
  );
  assert.ok(
    !sharedSessionLogIsOrdered([
      ordered(1, "sd:a", "u", "rev:r1"),
      ordered(3, "sd:b", "u", "rev:r1"),
    ]),
  ); // gap
  assert.ok(
    !sharedSessionLogIsOrdered([
      ordered(2, "sd:a", "u", "rev:r1"),
      ordered(1, "sd:b", "u", "rev:r1"),
    ]),
  ); // regression
  assert.ok(
    !sharedSessionLogIsOrdered([
      ordered(1, "sd:a", "u", "rev:r1"),
      ordered(1, "sd:b", "u", "rev:r1"),
    ]),
  ); // dup sequence
  assert.ok(
    !sharedSessionLogIsOrdered([
      ordered(1, "sd:a", "u", "rev:r1"),
      ordered(2, "sd:a", "u", "rev:r1"),
    ]),
  ); // dup delta id
  assert.ok(
    !sharedSessionLogIsOrdered([
      ordered(1, "sd:a", "u", "rev:r1"),
      { ...ordered(2, "sd:b", "u", "rev:r1"), operations: "not-an-array" as unknown as string[] },
    ]),
  ); // forged field
});

test("validate: the chain law — the reconciled delta's from-revision must be the session head (or the revision IS the head)", () => {
  const coordination: SharedSessionCoordination = {
    sessionId: "ss:1",
    headRevisionId: "rev:r1",
    lastSequence: 1,
    log: [ordered(1, "sd:a", "user:a", "rev:r1")],
  };
  validateSharedSessionReconcile(coordination, reconcileAt("rev:r2", "rev:r1")); // chain law holds
  const memoHit = reconcileAt("rev:r2", "rev:r1");
  const advanced = advanceCoordinationHead(coordination, "rev:r2");
  validateSharedSessionReconcile(advanced, memoHit); // idempotent re-save: revision IS the head
  assert.throws(
    () => validateSharedSessionReconcile(advanced, reconcileAt("rev:r3", "rev:r1")), // parent is stale
    (error: unknown) => {
      assert.ok(error instanceof SharedSessionConflictError);
      assert.equal(error.sessionHeadRevisionId, "rev:r2");
      assert.equal(error.deltaBaseRevisionId, "rev:r1");
      return true;
    },
  );
});

test("validate: a log that violates the total-order invariant is a typed order error (never a silent pass)", () => {
  const forged: SharedSessionCoordination = {
    sessionId: "ss:1",
    headRevisionId: "rev:r1",
    lastSequence: 2,
    log: [ordered(1, "sd:a", "user:a", "rev:r1"), ordered(3, "sd:b", "user:b", "rev:r1")],
  };
  assert.throws(
    () => validateSharedSessionReconcile(forged, reconcileAt("rev:r2", "rev:r1")),
    (error: unknown) => {
      assert.ok(error instanceof SharedSessionOrderError);
      assert.ok(error.detail.includes("lastSequence=2"));
      return true;
    },
  );
});
