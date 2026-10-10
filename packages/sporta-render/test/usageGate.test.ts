import assert from "node:assert/strict";
import { test } from "node:test";
import {
  RealityProjectionService,
  RenderModelError,
  RenderRightsRefusalError,
  swmRenderableUnder,
} from "../src/contract.js";
import type { RightsScope } from "@sporta/contracts/contract";
import { fixtureSnapshot, renderPermittedPolicy, renderProhibitedPolicy } from "./fixtures.js";

/**
 * The C6 usage-context gate battery (fail-closed invariant-22 law)
 * plus the app-layer two-realities composition.
 *
 * EVIDENCE LABEL: FIXTURE inputs (labeled in fixtures.ts); the gate
 * and the composition run FOR REAL under node:test (REAL:
 * deterministic execution, real outputs).
 */

const renderRights: RightsScope = renderPermittedPolicy.rights;

test("usage gate: fail-closed — absent or empty usage context never passes", () => {
  assert.equal(swmRenderableUnder(renderRights, undefined), false);
  assert.equal(swmRenderableUnder(renderRights, { usages: [] }), false);
});

test("usage gate: at least one declared usage must be affirmatively permitted", () => {
  assert.equal(swmRenderableUnder(renderRights, { usages: ["render"] }), true);
  assert.equal(swmRenderableUnder(renderRights, { usages: ["derive"] }), true);
  assert.equal(swmRenderableUnder(renderRights, { usages: ["edit"] }), false);
  assert.equal(swmRenderableUnder(renderRights, { usages: ["render", "edit"] }), true);
  assert.equal(swmRenderableUnder({ ...renderRights, usages: [] }, { usages: ["render"] }), false);
});

test("usage gate: any declared prohibited usage blocks the whole context", () => {
  const prohibited: RightsScope = renderProhibitedPolicy.rights;
  assert.equal(swmRenderableUnder(prohibited, { usages: ["render"] }), false);
  assert.equal(swmRenderableUnder(renderRights, { usages: ["render", "render"] }), true);
  const mixed: RightsScope = {
    ...renderRights,
    prohibitions: ["derive"],
  };
  assert.equal(swmRenderableUnder(mixed, { usages: ["render", "derive"] }), false);
  assert.equal(swmRenderableUnder(mixed, { usages: ["render"] }), true);
});

test("reality projection: both realities from the SAME snapshot, headers identical", () => {
  const snapshot = fixtureSnapshot();
  const projection = new RealityProjectionService().project(snapshot);
  assert.equal(projection.tactical.kind, "tactical");
  assert.equal(projection.playByPlay.kind, "play-by-play");
  assert.deepEqual(projection.tactical.source, projection.playByPlay.source);
  assert.deepEqual(projection.tactical.provenance, projection.playByPlay.provenance);
  assert.deepEqual(projection.tactical.rightsScope, projection.playByPlay.rightsScope);
  assert.deepEqual(projection.tactical.evidence, projection.playByPlay.evidence);
  assert.equal(projection.tactical.timeline.events.length, projection.playByPlay.records.length);
});

test("reality projection: the gated variant passes a permitted usage", () => {
  const snapshot = fixtureSnapshot();
  const projection = new RealityProjectionService().projectGated(snapshot, {
    usages: ["render"],
  });
  assert.equal(projection.tactical.kind, "tactical");
  assert.equal(projection.playByPlay.kind, "play-by-play");
});

test("reality projection: a prohibited usage is a typed rights refusal", () => {
  const snapshot = fixtureSnapshot({ policy: renderProhibitedPolicy });
  const service = new RealityProjectionService();
  assert.throws(
    () => service.projectGated(snapshot, { usages: ["render"] }),
    RenderRightsRefusalError,
  );
  try {
    service.projectGated(snapshot, { usages: ["render"] });
  } catch (error) {
    assert.ok(error instanceof RenderRightsRefusalError);
    assert.ok(error instanceof RenderModelError);
    assert.ok((error as RenderRightsRefusalError).detail.startsWith("rights-refused:"));
    assert.ok((error as RenderRightsRefusalError).detail.includes("swm:football"));
  }
});

test("reality projection: a non-declared usage is a typed rights refusal (fail-closed)", () => {
  const snapshot = fixtureSnapshot();
  const service = new RealityProjectionService();
  assert.throws(
    () => service.projectGated(snapshot, { usages: ["edit"] }),
    RenderRightsRefusalError,
  );
});

test("reality projection: the ungated pure composition stays ungated (plumbing law)", () => {
  // The artifact-plane split: the v1 plumbing (project) is ungated;
  // rights gate at the surfacing seam (projectGated). A prohibited
  // snapshot still projects through `project` — the model carries the
  // rights forward read-only so hosts re-check at surfacing.
  const snapshot = fixtureSnapshot({ policy: renderProhibitedPolicy });
  const projection = new RealityProjectionService().project(snapshot);
  assert.deepEqual(projection.tactical.rightsScope, {
    holders: renderProhibitedPolicy.rights.holders,
    usages: renderProhibitedPolicy.rights.usages,
    prohibitions: renderProhibitedPolicy.rights.prohibitions,
  });
});

test("reality projection: deterministic across runs", () => {
  const service = new RealityProjectionService();
  const one = service.project(fixtureSnapshot());
  const two = service.project(fixtureSnapshot());
  assert.equal(JSON.stringify(one), JSON.stringify(two));
});
