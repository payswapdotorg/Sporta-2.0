import assert from "node:assert/strict";
import { test } from "node:test";
import {
  exampleApplicationCapability,
  exampleApplicationEnvironmentDescriptor,
  exampleApplicationAttachment,
  exampleApplicationSession,
  exampleApplicationActionRecord,
  exampleApplicationActionAdmissionResult,
} from "../src/contract.example.js";
import type {
  ApplicationCapability,
  ApplicationEnvironmentDescriptor,
  ApplicationAttachment,
  ApplicationSession,
  ApplicationActionRecord,
  ApplicationActionAdmissionResult,
} from "../src/contract.js";

test("example capability is pure observation with no side effects", () => {
  const capability: ApplicationCapability = exampleApplicationCapability;
  assert.equal(capability.capabilityClass, "observe");
  assert.deepEqual(capability.sideEffects, []);
  assert.equal(capability.requiredPermissions.length, 0);
});

test("example descriptor declares scoped workspace binding and health", () => {
  const descriptor: ApplicationEnvironmentDescriptor = exampleApplicationEnvironmentDescriptor;
  assert.equal(descriptor.targetKind, "local");
  assert.equal(descriptor.networkNeeds, "none");
  assert.equal(descriptor.health.status, "healthy");
  assert.equal(descriptor.capabilities.length, 1);
});

test("example attachment grants observe only — control is absent", () => {
  const attachment: ApplicationAttachment = exampleApplicationAttachment;
  assert.deepEqual(attachment.grantedCapabilityClasses, ["observe"]);
  assert.equal(attachment.learningConsent.granted, false);
  assert.equal(attachment.revokedAt, null);
});

test("example session stays active with honest close state", () => {
  const session: ApplicationSession = exampleApplicationSession;
  assert.equal(session.closeState, "active");
  assert.deepEqual(session.activeGrants, ["observe"]);
  assert.equal(session.closedAt, null);
});

test("example action record carries verified effect and lineage refs", () => {
  const record: ApplicationActionRecord = exampleApplicationActionRecord;
  assert.equal(record.permissionDecision.decision, "allowed");
  assert.equal(record.effects[0].verified, true);
  assert.equal(record.reconciledRefs.workGraphId, "wg:example");
  assert.equal(record.missingCoverageNote, null);
});

test("example admission denial proves observation never implies mutation", () => {
  const admission: ApplicationActionAdmissionResult = exampleApplicationActionAdmissionResult;
  assert.equal(admission.admitted, false);
  if (!admission.admitted) {
    assert.equal(admission.reason, "capability-class-not-granted");
    assert.ok(admission.detail.length > 0);
  }
});
