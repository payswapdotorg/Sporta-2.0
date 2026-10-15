/**
 * W12-02/04 — the TL Wave 0 freeze test: the additive artifact-registry
 * enumeration read (`ArtifactGraphService.listArtifacts()`).
 *
 * EVIDENCE CLASS: REAL records over the in-memory registry (real ports,
 * fixture persistence — the graph service's standing label). The
 * enumeration asserts REAL record contents.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { ArtifactGraphService, FixedClock } from "../src/contract.js";
import type { PolicySet, ProvenanceDescriptor } from "@sporta/contracts/contract";

const policy: PolicySet = {
  rights: { holders: ["holder:w12"], usages: ["render"], prohibitions: [] },
  privacy: { visibility: "tenant", exportableFields: [] },
  retention: { disposition: "retain" },
};

const provenance: ProvenanceDescriptor = {
  sourceKind: "agent-run",
  sourceRef: "run:w12-freeze",
  capturedAt: "2026-10-15T00:00:00.000Z",
};

const graph = () => new ArtifactGraphService(new FixedClock("2026-10-15T00:00:00.000Z"));

test("W12-02 listArtifacts: empty registry enumerates empty (no fabricated artifacts)", () => {
  assert.deepEqual(graph().listArtifacts(), []);
});

test("W12-02 listArtifacts: registry order, records verbatim, idempotent re-record single-slot", async () => {
  const service = graph();
  const first = await service.recordArtifact({
    artifactId: "art:w12-1",
    kind: "event-stream",
    editability: "derived-only",
    policy,
  });
  const second = await service.recordArtifact({
    artifactId: "art:w12-2",
    kind: "edit-list",
    editability: "editable",
    policy,
  });
  // Idempotent re-record: the SAME artifact stays one registry slot.
  await service.recordArtifact({
    artifactId: "art:w12-1",
    kind: "event-stream",
    editability: "derived-only",
    policy,
  });

  const artifacts = service.listArtifacts();
  assert.equal(artifacts.length, 2, "idempotent: still exactly two");
  assert.deepEqual(artifacts[0], first, "registry order + verbatim: first");
  assert.deepEqual(artifacts[1], second, "registry order + verbatim: second");
});

test("W12-02 listArtifacts: readArtifact and listArtifacts agree (one registry)", async () => {
  const service = graph();
  const recorded = await service.recordArtifact({
    artifactId: "art:w12-3",
    kind: "event-stream",
    editability: "opaque",
    policy,
  });
  const revisions = await service.lineage("art:w12-3");
  assert.equal(revisions.length, 0, "no revisions yet — enumeration is registry-level");
  const viaPoint = service.readArtifact("art:w12-3");
  assert.ok(viaPoint !== null);
  const viaList = service.listArtifacts().find((a) => a.artifactId === "art:w12-3");
  assert.ok(viaList !== undefined);
  assert.deepEqual(viaList, viaPoint);
  assert.deepEqual(viaList, recorded);
  void provenance;
});
