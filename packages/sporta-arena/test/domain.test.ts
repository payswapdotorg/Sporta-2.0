import assert from "node:assert/strict";
import { test } from "node:test";
import type { GapStatus } from "../src/domain/gap.js";
import { transitionGapStatus } from "../src/domain/gap.js";
import type { EscalationLifecycle } from "../src/domain/escalation.js";
import {
  escalationLifecyclePath,
  nextEscalationLifecycleStep,
  transitionEscalationLifecycle,
} from "../src/domain/escalation.js";
import {
  IllegalEscalationTransitionError,
  IllegalGapTransitionError,
} from "../src/domain/errors.js";
import { expectedResultTypes } from "../src/domain/resultValidation.js";
import { stableStringify } from "../src/domain/fingerprint.js";

const FULL_ESCALATION_CHAIN: readonly EscalationLifecycle[] = [
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

test("gap lifecycle: legal chain open -> escalated -> resolved/closed", () => {
  assert.equal(transitionGapStatus("open", "escalated"), "escalated");
  assert.equal(transitionGapStatus("escalated", "resolved"), "resolved");
  assert.equal(transitionGapStatus("escalated", "closed"), "closed");
  assert.equal(transitionGapStatus("resolved", "closed"), "closed");
});

test("gap lifecycle: illegal transitions are typed errors", () => {
  const illegal: readonly [GapStatus, GapStatus][] = [
    ["open", "resolved"],
    ["open", "closed"],
    ["escalated", "open"],
    ["resolved", "escalated"],
    ["resolved", "open"],
    ["closed", "open"],
    ["closed", "resolved"],
  ];
  for (const [from, to] of illegal) {
    assert.throws(
      () => transitionGapStatus(from, to),
      IllegalGapTransitionError,
      `expected ${from} -> ${to} to be rejected`,
    );
  }
});

test("escalation lifecycle: default walk covers the literal contract chain", () => {
  const walked: EscalationLifecycle[] = ["created"];
  let current: EscalationLifecycle | null = "created";
  while (current !== null) {
    current = nextEscalationLifecycleStep(current);
    if (current !== null) walked.push(current);
  }
  assert.deepEqual(walked, FULL_ESCALATION_CHAIN);
});

test("escalation lifecycle: validating branches into the three documented outcomes", () => {
  assert.equal(nextEscalationLifecycleStep("validating"), "accepted_result");
  assert.equal(nextEscalationLifecycleStep("validating", "revision_required"), "revision_required");
  assert.equal(nextEscalationLifecycleStep("validating", "rejected"), "rejected");
  assert.equal(nextEscalationLifecycleStep("closed"), null);
  assert.equal(nextEscalationLifecycleStep("accepted_result"), "closed");
  assert.equal(nextEscalationLifecycleStep("revision_required"), "closed");
  assert.equal(nextEscalationLifecycleStep("rejected"), "closed");
});

test("escalation lifecycle: single-step transition legality", () => {
  assert.equal(transitionEscalationLifecycle("created", "triaged"), "triaged");
  assert.equal(transitionEscalationLifecycle("submitted", "validating"), "validating");
  assert.equal(
    transitionEscalationLifecycle("validating", "revision_required"),
    "revision_required",
  );
  assert.equal(transitionEscalationLifecycle("rejected", "closed"), "closed");
  const illegal: readonly [EscalationLifecycle, EscalationLifecycle][] = [
    ["created", "closed"],
    ["created", "submitted"],
    ["triaged", "offered"],
    ["submitted", "accepted_result"],
    ["accepted_result", "in_progress"],
    ["revision_required", "in_progress"],
    ["closed", "created"],
  ];
  for (const [from, to] of illegal) {
    assert.throws(
      () => transitionEscalationLifecycle(from, to),
      IllegalEscalationTransitionError,
      `expected ${from} -> ${to} to be rejected`,
    );
  }
});

test("escalation lifecycle: path function returns legal walks and rejects unreachable targets", () => {
  assert.deepEqual(escalationLifecyclePath("created", "closed"), FULL_ESCALATION_CHAIN);
  assert.deepEqual(escalationLifecyclePath("triaged", "submitted"), [
    "triaged",
    "matching",
    "offered",
    "accepted",
    "session_ready",
    "in_progress",
    "submitted",
  ]);
  assert.deepEqual(escalationLifecyclePath("validating", "closed"), [
    "validating",
    "accepted_result",
    "closed",
  ]);
  assert.deepEqual(escalationLifecyclePath("created", "created"), ["created"]);
  assert.throws(
    () => escalationLifecyclePath("accepted_result", "submitted"),
    IllegalEscalationTransitionError,
  );
  assert.throws(
    () => escalationLifecyclePath("closed", "created"),
    IllegalEscalationTransitionError,
  );
});

test("result validation policy table covers every session mode", () => {
  assert.deepEqual(expectedResultTypes("observe"), [
    "evidence-bundle",
    "review",
    "evaluation-verdict",
  ]);
  assert.deepEqual(expectedResultTypes("teach"), [
    "knowledge-patch",
    "solution",
    "learning-artifact-ref",
  ]);
  assert.equal(expectedResultTypes("takeover").includes("correction"), true);
  assert.equal(expectedResultTypes("review").includes("solution"), false);
});

test("stableStringify is key-order insensitive and array-order sensitive", () => {
  assert.equal(stableStringify({ a: 1, b: [2, 3] }), stableStringify({ b: [2, 3], a: 1 }));
  assert.notEqual(stableStringify({ a: [1, 2] }), stableStringify({ a: [2, 1] }));
  assert.equal(stableStringify("x"), '"x"');
  assert.equal(stableStringify(null), "null");
});
