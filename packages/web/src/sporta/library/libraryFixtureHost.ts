/**
 * The library screen browser FIXTURE host (W11C — the
 * studioBrowserFixture.ts precedent). EVIDENCE CLASS: FIXTURE, labeled
 * at the point of use. The REAL ArtifactGraphService/FS blob store are
 * headless Node legs; these static demo records (an editable project
 * with two revisions; a derived output with one) let the destination
 * screen be exercised in the browser. REAL artifact revisions/lineage
 * are projected in the node battery.
 */
import type {
  LibraryArtifactDetail,
  LibraryArtifactShape,
  LibraryScreenPort,
} from "./libraryScreenPorts.js";

const FIXTURE_PROJECT: LibraryArtifactShape = {
  artifactId: "art:fixture-project-1",
  kind: "tactical-board-video",
  editability: "editable",
};
const FIXTURE_RENDER: LibraryArtifactShape = {
  artifactId: "art:fixture-render-1",
  kind: "render-output",
  editability: "derived-only",
};

const FIXTURE_ARTIFACTS: readonly LibraryArtifactShape[] = [FIXTURE_PROJECT, FIXTURE_RENDER];

const FIXTURE_DETAILS: Readonly<Record<string, LibraryArtifactDetail>> = {
  "art:fixture-project-1": {
    artifact: FIXTURE_PROJECT,
    revisions: [
      {
        revisionId: "rev:fixture-project-1",
        artifactId: "art:fixture-project-1",
        contentHash: "sha256:" + "aa".repeat(32),
        toolVersions: ["sporta-render@0"],
        provenance: {
          sourceKind: "agent-run",
          sourceRef: "run:fixture-1",
          capturedAt: "2026-10-13T12:01:00.000Z",
        },
      },
      {
        revisionId: "rev:fixture-project-2",
        artifactId: "art:fixture-project-1",
        parentRevisionId: "rev:fixture-project-1",
        contentHash: "sha256:" + "bb".repeat(32),
        toolVersions: ["kdenlive@24.08.0", "sporta-render@0"],
        provenance: {
          sourceKind: "user-edit",
          sourceRef: "edit:fixture-user-1",
          capturedAt: "2026-10-13T12:05:00.000Z",
          confidence: 1,
        },
      },
    ],
    lineageNote:
      "fixture demo lineage — agent run seeded the project, then a user edit created revision 2 (history preserved)",
  },
  "art:fixture-render-1": {
    artifact: FIXTURE_RENDER,
    revisions: [
      {
        revisionId: "rev:fixture-render-1",
        artifactId: "art:fixture-render-1",
        contentHash: "sha256:" + "cc".repeat(32),
        toolVersions: ["sporta-render@0"],
        provenance: {
          sourceKind: "agent-run",
          sourceRef: "run:fixture-1",
          capturedAt: "2026-10-13T12:01:02.000Z",
        },
      },
    ],
    lineageNote: null,
  },
};

/** The labeled FIXTURE library host (see file header). */
export function createLibraryFixtureHost(): LibraryScreenPort {
  return {
    backing: "fixture",
    async listArtifacts() {
      return FIXTURE_ARTIFACTS.map((artifact) => ({ ...artifact }));
    },
    async readArtifact(artifactId: string) {
      const detail = FIXTURE_DETAILS[artifactId];
      if (detail === undefined) {
        throw new Error(`fixture host: no artifact ${artifactId} (typed refusal — never a fabricated lineage)`);
      }
      return {
        artifact: { ...detail.artifact },
        revisions: detail.revisions.map((revision) => ({ ...revision })),
        lineageNote: detail.lineageNote,
      };
    },
  };
}
