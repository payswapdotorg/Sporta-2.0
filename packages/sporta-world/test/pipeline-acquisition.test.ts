/**
 * Wave 5 (w5a) perception pipeline — stage 1: acquisition.
 *
 * EVIDENCE CLASS: fixture. Every acquisition manifest below is
 * fixture-grade synthetic data (a synthetic broadcast declaration),
 * honestly labeled. The pure functions run for REAL — real
 * deterministic outputs on real inputs. NO real media, no rights
 * holder, no perception provider (see SPEC, "Evidence grading").
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  AcquisitionProvenanceError,
  AcquisitionRightsError,
  acquireSources,
} from "../src/contract.js";
import type { AcquisitionManifest, PolicySet } from "../src/contract.js";

const T0 = "2026-04-01T00:00:00.000Z";

const policy: PolicySet = {
  rights: { holders: ["holder:broadcaster"], usages: ["render"], prohibitions: [] },
  privacy: { visibility: "tenant", exportableFields: [] },
  retention: { disposition: "retain" },
};

function footballManifest(overrides: Partial<AcquisitionManifest> = {}): AcquisitionManifest {
  return {
    manifestId: "acq:w5a-football",
    domain: "football",
    provenanceSeed: {
      sourceKind: "authorized-source",
      sourceRef: "broadcaster:efl",
      capturedAt: T0,
      confidence: 0.95,
    },
    mediaRefs: [{ mediaId: "camera:main", kind: "video", capturedAt: T0 }],
    policy,
    ...overrides,
  };
}

test("acquisition validates an authorized manifest into a chain record", () => {
  const records = acquireSources([footballManifest()]);
  assert.equal(records.length, 1);
  const record = records[0];
  assert.ok(record !== undefined);
  assert.deepEqual(record.chain, {
    acquisitionId: "acq:w5a-football",
    domain: "football",
    sourceKind: "authorized-source",
    sourceRef: "broadcaster:efl",
  });
  assert.equal(record.sourceConfidenceCeiling, 0.95);
  assert.deepEqual(record.mediaRefs, [{ mediaId: "camera:main", kind: "video", capturedAt: T0 }]);
  assert.deepEqual(record.policy, policy);
  // the "observation" source kind is equally authorized at the gate
  const observationSeed = acquireSources([
    footballManifest({
      manifestId: "acq:obs-seed",
      provenanceSeed: {
        sourceKind: "observation",
        sourceRef: "camera:obs",
        capturedAt: T0,
        confidence: 0.9,
      },
    }),
  ]);
  assert.equal(observationSeed[0]?.chain.sourceKind, "observation");
});

test("acquisition refuses every non-authorized source kind (fail-closed, typed)", () => {
  const refused = ["arena-session", "agent-run", "measurement", "editor-session", "human-judgment"];
  for (const sourceKind of refused) {
    assert.throws(
      () =>
        acquireSources([
          footballManifest({
            provenanceSeed: { sourceKind, sourceRef: "ref:bad", capturedAt: T0 },
          }),
        ]),
      (error: unknown) => {
        assert.ok(error instanceof AcquisitionProvenanceError, `sourceKind ${sourceKind}`);
        assert.ok(error.detail.includes(sourceKind));
        return true;
      },
    );
  }
});

test("acquisition requires a valid seed confidence (fail-closed)", () => {
  // missing seed confidence
  assert.throws(
    () =>
      acquireSources([
        footballManifest({
          provenanceSeed: { sourceKind: "authorized-source", sourceRef: "b", capturedAt: T0 },
        }),
      ]),
    (error: unknown) => error instanceof AcquisitionProvenanceError,
  );
  // out-of-range seed confidence
  assert.throws(
    () =>
      acquireSources([
        footballManifest({
          provenanceSeed: {
            sourceKind: "authorized-source",
            sourceRef: "b",
            capturedAt: T0,
            confidence: 1.5,
          },
        }),
      ]),
    (error: unknown) => error instanceof AcquisitionProvenanceError,
  );
  // out-of-range declared ceiling
  assert.throws(
    () => acquireSources([footballManifest({ sourceConfidenceCeiling: 1.2 })]),
    (error: unknown) => error instanceof AcquisitionProvenanceError,
  );
  // the effective ceiling is min(seed confidence, declared ceiling) — never above the seed
  const records = acquireSources([footballManifest({ sourceConfidenceCeiling: 0.7 })]);
  assert.equal(records[0]?.sourceConfidenceCeiling, 0.7);
});

test("acquisition refuses a rights scope that affirms no usage (fail-closed)", () => {
  assert.throws(
    () =>
      acquireSources([
        footballManifest({
          policy: {
            ...policy,
            rights: { holders: ["holder:broadcaster"], usages: [], prohibitions: [] },
          },
        }),
      ]),
    (error: unknown) => {
      assert.ok(error instanceof AcquisitionRightsError);
      return true;
    },
  );
});

test("acquisition refuses malformed manifest batches (fail-closed)", () => {
  assert.throws(
    () => acquireSources([footballManifest({ mediaRefs: [] })]),
    (error: unknown) => error instanceof AcquisitionProvenanceError,
  );
  assert.throws(
    () =>
      acquireSources([
        footballManifest({
          manifestId: "acq:dup-media",
          mediaRefs: [
            { mediaId: "camera:main", kind: "video", capturedAt: T0 },
            { mediaId: "camera:main", kind: "video", capturedAt: T0 },
          ],
        }),
      ]),
    (error: unknown) => error instanceof AcquisitionProvenanceError,
  );
  assert.throws(
    () => acquireSources([footballManifest(), footballManifest()]), // duplicate manifestId
    (error: unknown) => error instanceof AcquisitionProvenanceError,
  );
  assert.throws(
    () =>
      acquireSources([
        footballManifest(),
        footballManifest({ manifestId: "acq:other", domain: "basketball" }),
      ]), // mixed domains in one batch
    (error: unknown) => error instanceof AcquisitionProvenanceError,
  );
  // an empty batch is total
  assert.deepEqual(acquireSources([]), []);
});
