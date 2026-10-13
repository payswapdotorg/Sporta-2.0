/**
 * W9C-1 — descriptor registry laws.
 *
 * EVIDENCE CLASS: REAL domain laws over fixture descriptor content.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ApplicationRegistryError,
  assertCatalogStable,
  declaredCapabilityClasses,
  descriptorIdentity,
  validateApplicationDescriptor,
} from "../src/contract.js";
import {
  appendHighlightCapability,
  makeDescriptor,
  makeAppWorld,
  readStatusCapability,
  renameBoardCapability,
  syncRemoteCapability,
} from "./helpers.js";

test("a well-formed descriptor validates with zero violations", () => {
  const violations = validateApplicationDescriptor(makeDescriptor());
  assert.deepEqual(violations, []);
});

test("duplicate capability ids, empty fields and unknown vocabularies fail closed", () => {
  const violations = validateApplicationDescriptor(
    makeDescriptor({
      capabilities: [readStatusCapability, readStatusCapability],
      targetKind: "cloud" as never,
      networkNeeds: "open" as never,
      health: { checkedAt: "", status: "broken" as never },
      dataClasses: [],
    }),
  );
  const joined = violations.join("; ");
  assert.match(joined, /duplicated/);
  assert.match(joined, /targetKind/);
  assert.match(joined, /networkNeeds/);
  assert.match(joined, /health.status/);
  assert.match(joined, /dataClasses/);
});

test("declaredCapabilityClasses lists the exact declared set", () => {
  const descriptor = makeDescriptor({
    capabilities: [readStatusCapability, appendHighlightCapability, syncRemoteCapability],
  });
  assert.deepEqual(declaredCapabilityClasses(descriptor), [
    "observe",
    "control",
    "network-access",
  ]);
});

test("descriptor identity is the (application, version, target) triple", () => {
  const a = makeDescriptor();
  const b = makeDescriptor({ descriptorId: "desc:other" });
  const c = makeDescriptor({ appVersion: "1.0.1" });
  assert.equal(descriptorIdentity(a), descriptorIdentity(b));
  assert.notEqual(descriptorIdentity(a), descriptorIdentity(c));
});

test("re-registering the same identity with a CHANGED catalog is a typed error (security law 3)", () => {
  const existing = makeDescriptor();
  const broader = makeDescriptor({
    descriptorId: "desc:broader",
    capabilities: [readStatusCapability, appendHighlightCapability, renameBoardCapability],
  });
  assert.throws(
    () => assertCatalogStable(existing, broader),
    (error: unknown) => {
      assert.ok(error instanceof ApplicationRegistryError);
      assert.equal(error.refusalKind, "capability-catalog-changed");
      return true;
    },
  );
  // Same catalog (same identity) re-registering is fine.
  const same = makeDescriptor({ descriptorId: "desc:same", health: { checkedAt: "2026-10-13T01:00:00.000Z", status: "healthy" } });
  assertCatalogStable(existing, same);
});

test("the registry service refuses malformed descriptors and keeps catalog stability", () => {
  const world = makeAppWorld();
  world.environment.registerDescriptor(makeDescriptor());
  assert.throws(
    () =>
      world.environment.registerDescriptor(
        makeDescriptor({ descriptorId: "desc:malformed", capabilities: [] }),
      ),
    (error: unknown) => {
      assert.ok(error instanceof ApplicationRegistryError);
      assert.equal(error.refusalKind, "descriptor-malformed");
      return true;
    },
  );
  assert.throws(
    () =>
      world.environment.registerDescriptor(
        makeDescriptor({
          descriptorId: "desc:changed-catalog",
          capabilities: [readStatusCapability, appendHighlightCapability, renameBoardCapability],
        }),
      ),
    (error: unknown) => {
      assert.ok(error instanceof ApplicationRegistryError);
      assert.equal(error.refusalKind, "capability-catalog-changed");
      return true;
    },
  );
  assert.equal(world.environment.listDescriptors().length, 1);
  assert.equal(world.environment.readDescriptor("desc:test-app")?.applicationId, "app:test-board");
  assert.equal(world.environment.readDescriptor("desc:missing"), null);
});
