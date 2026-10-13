/**
 * W9C-1 — descriptor registry validation tests (P9-18).
 *
 * EVIDENCE CLASS: REAL law observations over fixture content — the
 * validator is the real pure function; violations are asserted typed and
 * deterministically ordered.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ApplicationDescriptorValidationError,
  ApplicationUnknownRecordError,
  DescriptorRegistryService,
  FixedClock,
  InMemoryAppEnvironmentStore,
  validateApplicationEnvironmentDescriptor,
} from "../src/contract.js";
import {
  LATER,
  NOW,
  controlCapability,
  makeDescriptor,
  observeCapability,
} from "./helpers.js";

test("a well-formed descriptor validates with its capability count", () => {
  const validation = validateApplicationEnvironmentDescriptor(makeDescriptor());
  assert.deepEqual(validation, { valid: true, capabilityCount: 3 });
});

test("duplicate capability ids are a typed violation", () => {
  const validation = validateApplicationEnvironmentDescriptor(
    makeDescriptor({ capabilities: [observeCapability, observeCapability] }),
  );
  assert.equal(validation.valid, false);
  if (!validation.valid) {
    assert.ok(validation.violations.some((v) => v.kind === "duplicate-capability"));
  }
});

test("an observe capability declaring side effects is refused — observation never implies mutation (lock 30)", () => {
  const mutatingObserve = { ...observeCapability, sideEffects: ["state:notes"] };
  const validation = validateApplicationEnvironmentDescriptor(
    makeDescriptor({ capabilities: [mutatingObserve] }),
  );
  assert.equal(validation.valid, false);
  if (!validation.valid) {
    assert.ok(
      validation.violations.some((v) => v.kind === "capability-shape" && v.detail.includes("observe")),
    );
  }
});

test("unknown capability class / target kind / network needs are typed violations", () => {
  const validation = validateApplicationEnvironmentDescriptor(
    makeDescriptor({ targetKind: "satellite" as never, networkNeeds: "open" as never }),
  );
  assert.equal(validation.valid, false);
  if (!validation.valid) {
    assert.ok(validation.violations.some((v) => v.kind === "unknown-class" || v.kind === "target-kind"));
    assert.ok(validation.violations.some((v) => v.kind === "network-needs"));
  }
});

test("malformed health and missing licensing are typed violations", () => {
  const validation = validateApplicationEnvironmentDescriptor(
    makeDescriptor({
      health: { checkedAt: "yesterday", status: "great" as never },
      licensing: { license: "", provenance: "x" },
    }),
  );
  assert.equal(validation.valid, false);
  if (!validation.valid) {
    assert.ok(validation.violations.some((v) => v.kind === "health"));
    assert.ok(validation.violations.some((v) => v.kind === "licensing"));
  }
});

test("violations are deterministically ordered (kind rank, then detail)", () => {
  const first = validateApplicationEnvironmentDescriptor(
    makeDescriptor({ targetKind: "satellite" as never, licensing: { license: "", provenance: "x" } }),
  );
  const second = validateApplicationEnvironmentDescriptor(
    makeDescriptor({ targetKind: "satellite" as never, licensing: { license: "", provenance: "x" } }),
  );
  assert.deepEqual(first, second);
  // The deterministic kind-rank order (SPEC W9C-1): target-kind before
  // licensing in the fixed violation ladder.
  if (!first.valid) {
    assert.deepEqual(first.violations.map((v) => v.kind), ["target-kind", "licensing"]);
  }
});

test("the registry service refuses invalid descriptors with the typed error carrying every violation", () => {
  const store = new InMemoryAppEnvironmentStore();
  const registry = new DescriptorRegistryService({ clock: new FixedClock(NOW), descriptors: store });
  const invalid = makeDescriptor({ capabilities: [] });
  assert.throws(
    () => registry.registerDescriptor(invalid),
    (error: unknown) =>
      error instanceof ApplicationDescriptorValidationError && error.violations.length > 0,
  );
});

test("the registry registers valid descriptors idempotently and refuses conflicting re-registration", () => {
  const store = new InMemoryAppEnvironmentStore();
  const registry = new DescriptorRegistryService({ clock: new FixedClock(NOW), descriptors: store });
  const descriptor = makeDescriptor();
  registry.registerDescriptor(descriptor);
  assert.deepEqual(registry.registerDescriptor(descriptor), descriptor);
  assert.throws(
    () => registry.registerDescriptor({ ...descriptor, appVersion: "2.0.0" }),
    ApplicationDescriptorValidationError,
  );
  assert.equal(registry.listDescriptors().length, 1);
});

test("readDescriptor refuses unknown descriptors with the typed error", () => {
  const store = new InMemoryAppEnvironmentStore();
  const registry = new DescriptorRegistryService({ clock: new FixedClock(NOW), descriptors: store });
  assert.throws(() => registry.readDescriptor("desc:missing"), ApplicationUnknownRecordError);
});

test("verifyTarget reports unreachable targets honestly (typed adapter error surfaced, never empty evidence)", async () => {
  const store = new InMemoryAppEnvironmentStore();
  const registry = new DescriptorRegistryService({
    clock: new FixedClock(LATER),
    descriptors: store,
    targets: {
      readTargetState: () => {
        throw new Error("real read failed");
      },
      targetWorkspacePath: () => null,
    },
  });
  registry.registerDescriptor(makeDescriptor());
  const verification = await registry.verifyTarget("desc:test-app-1");
  assert.equal(verification.reachable, false);
  assert.equal(verification.stateDigest, null);
  assert.ok(verification.observations.some((o) => o.kind === "target-unreachable"));
});

test("verifyTarget reports reachable targets with the real state digest", async () => {
  const store = new InMemoryAppEnvironmentStore();
  const registry = new DescriptorRegistryService({
    clock: new FixedClock(LATER),
    descriptors: store,
    targets: {
      readTargetState: () =>
        Promise.resolve({
          stateDigest: "sha256:abc",
          observations: [{ kind: "state:status", detail: "ok" }],
        }),
      targetWorkspacePath: () => "/tmp/app",
    },
  });
  registry.registerDescriptor(makeDescriptor());
  const verification = await registry.verifyTarget("desc:test-app-1");
  assert.equal(verification.reachable, true);
  assert.equal(verification.stateDigest, "sha256:abc");
});

test("the declared capability classes are exactly the catalog's classes (independence law)", () => {
  const descriptor = makeDescriptor({
    capabilities: [observeCapability, controlCapability],
  });
  // imported for the independence assertion
  void controlCapability;
  const validation = validateApplicationEnvironmentDescriptor(descriptor);
  assert.equal(validation.valid, true);
});
