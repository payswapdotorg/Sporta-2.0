import assert from "node:assert/strict";
import { test } from "node:test";
import {
  SharedSessionAdmissionError,
  SharedSessionClosedError,
  UnknownSharedParticipantError,
  closeSharedSessionRecord,
  findPresence,
  heartbeatPresence,
  joinPresence,
  joinSharedSession,
  leavePresence,
  leaveSharedSession,
  liveParticipantIds,
  openSharedSessionRecord,
  requireLiveParticipant,
  sharedSessionAdmission,
  underlyingEditorSessionIdFor,
} from "../src/contract.js";
import type { PolicySet } from "@sporta/contracts/contract";
import type { EditorResolution } from "../src/contract.js";

/**
 * W6A pure-domain laws, part 1 — the admission gate, the shared-session
 * record transitions, and presence transforms. EVIDENCE CLASS: pure
 * domain (no IO, no timers, no stores — every law is exercised over
 * plain records).
 */

const CHECKPOINT_POLICY: PolicySet = {
  rights: { holders: ["holder:w6a"], usages: ["render", "edit", "derive"], prohibitions: [] },
  privacy: { visibility: "tenant", exportableFields: [] },
  retention: { disposition: "retain" },
};

const NO_EDIT_POLICY: PolicySet = {
  rights: { holders: ["holder:w6a"], usages: ["render"], prohibitions: [] },
  privacy: { visibility: "tenant", exportableFields: [] },
  retention: { disposition: "retain" },
};

const EDIT_PROHIBITED_POLICY: PolicySet = {
  rights: { holders: ["holder:w6a"], usages: ["render"], prohibitions: ["edit"] },
  privacy: { visibility: "tenant", exportableFields: [] },
  retention: { disposition: "retain" },
};

const MIXED_PROHIBITED_POLICY: PolicySet = {
  rights: { holders: ["holder:w6a"], usages: ["render", "edit"], prohibitions: ["derive"] },
  privacy: { visibility: "tenant", exportableFields: [] },
  retention: { disposition: "retain" },
};

const RESOLUTION: EditorResolution = {
  editorId: "kdenlive",
  integrationLevel: 2,
  rationale: "kdenlive (level 2) selected for round-trip",
};

const OPEN_INPUT = {
  sessionId: "ss:1",
  resolution: RESOLUTION,
  underlyingEditorSessionId: "ss:1#es",
  checkpoint: {
    artifactId: "art:w6a",
    revisionId: "rev:w6a-1",
    contentHash: "ab".repeat(32),
    policy: CHECKPOINT_POLICY,
  },
  opener: {
    participantId: "user:opener",
    capabilities: ["timeline"],
    usage: { usages: ["edit", "render"] },
  },
  openedAt: "2026-10-01T00:00:00.000Z",
} as const;

function admissionErrorDetail(error: unknown): string {
  assert.ok(error instanceof SharedSessionAdmissionError);
  return error.detail;
}

test("admission: an absent or empty usage context admits NO ONE (fail-closed)", () => {
  assert.throws(
    () =>
      sharedSessionAdmission(
        { checkpointRevisionId: "rev:1", policy: CHECKPOINT_POLICY },
        undefined,
      ),
    (error: unknown) => admissionErrorDetail(error).includes("usage-context-empty"),
  );
  assert.throws(
    () =>
      sharedSessionAdmission(
        { checkpointRevisionId: "rev:1", policy: CHECKPOINT_POLICY },
        { usages: [] },
      ),
    (error: unknown) => admissionErrorDetail(error).includes("usage-context-empty"),
  );
});

test("admission: the context must declare edit (a shared EDITING session)", () => {
  assert.throws(
    () =>
      sharedSessionAdmission(
        { checkpointRevisionId: "rev:1", policy: CHECKPOINT_POLICY },
        { usages: ["render"] },
      ),
    (error: unknown) => admissionErrorDetail(error).includes("edit-not-declared"),
  );
});

test("admission: a participant NEVER gains rights the checkpoint revision does not carry", () => {
  assert.throws(
    () =>
      sharedSessionAdmission(
        { checkpointRevisionId: "rev:1", policy: NO_EDIT_POLICY },
        { usages: ["edit", "render"] },
      ),
    (error: unknown) => admissionErrorDetail(error).includes("checkpoint=rev:1"),
  );
  assert.throws(
    () =>
      sharedSessionAdmission(
        { checkpointRevisionId: "rev:1", policy: EDIT_PROHIBITED_POLICY },
        { usages: ["edit"] },
      ),
    (error: unknown) => admissionErrorDetail(error).includes("checkpoint=rev:1"),
  );
});

test("admission: a mixed context with a prohibited usage is refused as a whole", () => {
  assert.throws(
    () =>
      sharedSessionAdmission(
        { checkpointRevisionId: "rev:1", policy: MIXED_PROHIBITED_POLICY },
        { usages: ["edit", "derive"] },
      ),
    (error: unknown) => admissionErrorDetail(error).includes("prohibited-usage:derive"),
  );
});

test("admission: effective usages = declared ∩ checkpoint-permitted (order preserved)", () => {
  const effective = sharedSessionAdmission(
    { checkpointRevisionId: "rev:1", policy: CHECKPOINT_POLICY },
    { usages: ["edit", "private-usage", "render"] },
  );
  assert.deepEqual(effective, ["edit", "render"]);
});

test("open: the opener is admitted as participant #1 through the same gate; the record cites the checkpoint", () => {
  const record = openSharedSessionRecord(OPEN_INPUT);
  assert.equal(record.sessionId, "ss:1");
  assert.equal(record.integrationLevel, 3);
  assert.equal(record.state, "open");
  assert.equal(record.underlyingEditorSessionId, "ss:1#es");
  assert.equal(record.artifactRef.checkpointRevisionId, "rev:w6a-1");
  assert.equal(record.admission.checkpointRevisionId, "rev:w6a-1");
  assert.deepEqual(record.admission.policy, CHECKPOINT_POLICY);
  assert.equal(record.participants.length, 1);
  const opener = record.participants[0];
  assert.ok(opener);
  assert.equal(opener.participantId, "user:opener");
  assert.deepEqual(opener.effectiveUsages, ["edit", "render"]);
  assert.equal(opener.admission.checkpointRevisionId, "rev:w6a-1");
  assert.deepEqual(liveParticipantIds(record.presence), ["user:opener"]);
  assert.deepEqual(record.resolution, RESOLUTION);
});

test("open: an opener without a usable usage context is refused before any record exists", () => {
  assert.throws(
    () =>
      openSharedSessionRecord({
        ...OPEN_INPUT,
        opener: { participantId: "user:opener", usage: { usages: [] } },
      }),
    (error: unknown) => admissionErrorDetail(error).includes("usage-context-empty"),
  );
});

test("the underlying broker session id is derived deterministically", () => {
  assert.equal(underlyingEditorSessionIdFor("ss:7"), "ss:7#es");
  assert.equal(underlyingEditorSessionIdFor("ss:7"), underlyingEditorSessionIdFor("ss:7"));
});

test("join: appends a participant with presence live and gate-derived rights", () => {
  const record = openSharedSessionRecord(OPEN_INPUT);
  const joined = joinSharedSession(
    record,
    { participantId: "user:b", capabilities: ["live"], usage: { usages: ["edit", "derive"] } },
    "2026-10-01T00:01:00.000Z",
  );
  assert.equal(joined.participants.length, 2);
  const second = joined.participants[1];
  assert.ok(second);
  assert.equal(second.participantId, "user:b");
  assert.deepEqual(second.effectiveUsages, ["edit", "derive"]);
  assert.deepEqual(liveParticipantIds(joined.presence), ["user:opener", "user:b"]);
});

test("join: idempotent while live; re-admits through the gate after leaving", () => {
  const record = openSharedSessionRecord(OPEN_INPUT);
  const joined = joinSharedSession(
    record,
    { participantId: "user:b", usage: { usages: ["edit"] } },
    "2026-10-01T00:01:00.000Z",
  );
  assert.deepEqual(
    joinSharedSession(
      joined,
      { participantId: "user:b", usage: { usages: ["edit"] } },
      "2026-10-01T00:02:00.000Z",
    ),
    joined,
  );
  const left = leaveSharedSession(joined, "user:b", "disconnected", "2026-10-01T00:03:00.000Z");
  const rejoined = joinSharedSession(
    left,
    { participantId: "user:b", usage: { usages: ["edit"] } },
    "2026-10-01T00:04:00.000Z",
  );
  const again = rejoined.participants.find((candidate) => candidate.participantId === "user:b");
  assert.ok(again);
  assert.equal(again.leftAt, undefined); // fresh admission, one record per id
  assert.equal(again.admittedAt, "2026-10-01T00:04:00.000Z");
  assert.deepEqual(liveParticipantIds(rejoined.presence), ["user:opener", "user:b"]);
});

test("join: a closed session admits no one", () => {
  const closed = closeSharedSessionRecord(
    openSharedSessionRecord(OPEN_INPUT),
    "2026-10-01T00:09:00.000Z",
  );
  assert.throws(
    () =>
      joinSharedSession(
        closed,
        { participantId: "user:b", usage: { usages: ["edit"] } },
        "2026-10-01T00:10:00.000Z",
      ),
    (error: unknown) => {
      assert.ok(error instanceof SharedSessionClosedError);
      assert.equal(error.sessionId, "ss:1");
      return true;
    },
  );
});

test("leave: typed reason, first leave wins, unknown participants are typed refusals", () => {
  const record = joinSharedSession(
    openSharedSessionRecord(OPEN_INPUT),
    { participantId: "user:b", usage: { usages: ["edit"] } },
    "2026-10-01T00:01:00.000Z",
  );
  const left = leaveSharedSession(record, "user:b", "evicted", "2026-10-01T00:02:00.000Z");
  const gone = left.participants.find((candidate) => candidate.participantId === "user:b");
  assert.ok(gone);
  assert.equal(gone.leaveReason, "evicted");
  assert.equal(gone.leftAt, "2026-10-01T00:02:00.000Z");
  assert.deepEqual(liveParticipantIds(left.presence), ["user:opener"]);
  assert.deepEqual(leaveSharedSession(left, "user:b", "left", "2026-10-01T00:03:00.000Z"), left); // first leave wins
  assert.throws(
    () => leaveSharedSession(left, "user:ghost", "left", "2026-10-01T00:04:00.000Z"),
    (error: unknown) => {
      assert.ok(error instanceof UnknownSharedParticipantError);
      assert.equal(error.participantId, "user:ghost");
      return true;
    },
  );
});

test("close: every live participant leaves with reason closed; first close wins", () => {
  const record = joinSharedSession(
    openSharedSessionRecord(OPEN_INPUT),
    { participantId: "user:b", usage: { usages: ["edit"] } },
    "2026-10-01T00:01:00.000Z",
  );
  const left = leaveSharedSession(record, "user:b", "left", "2026-10-01T00:02:00.000Z");
  const closed = closeSharedSessionRecord(left, "2026-10-01T00:05:00.000Z");
  assert.equal(closed.state, "closed");
  assert.equal(closed.closedAt, "2026-10-01T00:05:00.000Z");
  const opener = closed.participants.find((candidate) => candidate.participantId === "user:opener");
  const gone = closed.participants.find((candidate) => candidate.participantId === "user:b");
  assert.ok(opener && opener.leaveReason === "closed"); // live at close -> closed
  assert.ok(gone && gone.leaveReason === "left"); // already left -> original reason
  assert.deepEqual(liveParticipantIds(closed.presence), []);
  assert.deepEqual(closeSharedSessionRecord(closed, "2026-10-01T00:06:00.000Z"), closed);
});

test("requireLiveParticipant: only live admitted participants pass", () => {
  const record = joinSharedSession(
    openSharedSessionRecord(OPEN_INPUT),
    { participantId: "user:b", usage: { usages: ["edit"] } },
    "2026-10-01T00:01:00.000Z",
  );
  requireLiveParticipant(record, "user:opener"); // no throw
  const left = leaveSharedSession(record, "user:b", "left", "2026-10-01T00:02:00.000Z");
  assert.throws(
    () => requireLiveParticipant(left, "user:b"),
    (error: unknown) => admissionErrorDetail(error).includes("not-live:user:b"),
  );
  assert.throws(
    () => requireLiveParticipant(left, "user:ghost"),
    (error: unknown) => {
      assert.ok(error instanceof UnknownSharedParticipantError);
      return true;
    },
  );
});

test("presence: heartbeat refreshes lastHeartbeatAt only (pure record, no timers)", () => {
  let presence = joinPresence(
    [],
    { participantId: "user:a", capabilities: ["timeline"] },
    "2026-10-01T00:00:00.000Z",
  );
  presence = heartbeatPresence(presence, "user:a", "2026-10-01T00:00:30.000Z");
  const entry = presence[0];
  assert.ok(entry);
  assert.equal(entry.joinedAt, "2026-10-01T00:00:00.000Z");
  assert.equal(entry.lastHeartbeatAt, "2026-10-01T00:00:30.000Z");
  assert.equal(entry.state, "live");
  presence = leavePresence(presence, "user:a");
  assert.throws(
    () => heartbeatPresence(presence, "user:a", "2026-10-01T00:01:00.000Z"),
    (error: unknown) => {
      assert.ok(error instanceof UnknownSharedParticipantError);
      return true;
    },
  );
  // re-join goes live again under the same record
  presence = joinPresence(
    presence,
    { participantId: "user:a", capabilities: [] },
    "2026-10-01T00:02:00.000Z",
  );
  assert.deepEqual(liveParticipantIds(presence), ["user:a"]);
  assert.equal(findPresence(presence, "user:a")?.lastHeartbeatAt, "2026-10-01T00:02:00.000Z");
});
