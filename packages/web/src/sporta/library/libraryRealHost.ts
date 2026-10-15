/**
 * W12A-2 — the library screen REAL host (composition-grade). EVIDENCE
 * CLASS: REAL, labeled at the point of use. A pure projection over the
 * REAL ArtifactGraphService registry (the W12-02 freeze enumeration
 * read): `listArtifacts()` returns the registry in insertion order;
 * `readArtifact(id)` returns the artifact + its immutable revision
 * lineage ROOT-FIRST (the Library law — history is preserved, never an
 * overwritable file list); typed refusals propagate verbatim.
 *
 * State-owner law (the ADR): this host owns NO store, NO registry, NO
 * second state. The graph IS the single artifact authority; this
 * adapter is a structural projection over its records (the frozen
 * mirror shapes in `libraryScreenPorts.ts`). The browser demo mount
 * keeps the labeled fixture host (`libraryFixtureHost.ts`) with
 * `backing: "fixture"` — the two are siblings, never replacements.
 *
 * Acceptance: W12-08 (REAL committed revisions through the REAL host;
 * immutable lineage root-first; honest editability classes; unknown-
 * artifact typed refusal).
 */
import type { ArtifactGraphService } from "@sporta/artifacts/contract";
import type {
  ArtifactRecord,
  ArtifactRevisionRecord,
} from "@sporta/contracts/contract";
import type {
  LibraryArtifactDetail,
  LibraryArtifactShape,
  LibraryProvenanceShape,
  LibraryRevisionShape,
  LibraryScreenPort,
} from "./libraryScreenPorts.js";

/**
 * The REAL library host. Extends the frozen `LibraryScreenPort` with one
 * additive field — `gradeNote` — so the TL composition root can surface
 * the honest registry grade to the screen (parity with the runs host;
 * W12-07 law generalized). The screen that consumes only
 * `LibraryScreenPort` keeps compiling; the composition root reads the
 * additive field for the badge.
 */
export interface LibraryRealHost extends LibraryScreenPort {
  /**
   * Honest grade note carried to the screen surface. Verbatim:
   * `"BACKING: REAL (registry: fixture-grade in-memory)"` — the
   * artifact registry is fixture-grade in-memory (the W3-A/W11 law
   * carried); the host is REAL because it projects over the REAL
   * service, but the registry honesty label carries, never re-badged.
   */
  readonly gradeNote: string;
}

/** Constructor dependencies (the REAL graph; no store owned here). */
export interface CreateLibraryRealHostDeps {
  /** The REAL ArtifactGraphService (the single artifact-registry authority). */
  graph: ArtifactGraphService;
}

/**
 * The honesty label carried from the artifact fabric — the registry is
 * fixture-grade in-memory. The host is REAL (it projects over the REAL
 * service); the registry honesty label carries, never re-badged (the
 * W12-07 law generalized to the library lane).
 */
export const LIBRARY_REGISTRY_GRADE_NOTE =
  "BACKING: REAL (registry: fixture-grade in-memory)";

/**
 * Create a REAL library host over the REAL ArtifactGraphService. The
 * host is a pure projection: service records in, screen-port shapes
 * out. Typed errors propagate verbatim — never swallowed, never stringly.
 *
 * The returned object satisfies `LibraryScreenPort` (compile-time
 * proof against the frozen port) AND exposes the additive `gradeNote`
 * for composition-grade wiring (the TL's productComposition.ts reads
 * it for the screen's evidence badge).
 */
export function createLibraryRealHost(
  deps: CreateLibraryRealHostDeps,
): LibraryRealHost {
  const { graph } = deps;
  return {
    backing: "real",
    gradeNote: LIBRARY_REGISTRY_GRADE_NOTE,
    async listArtifacts(): Promise<readonly LibraryArtifactShape[]> {
      // W12-02 freeze: the service's listArtifacts() returns the
      // registry in insertion order; the private Map IS the registry
      // (not a second authority). Project every field verbatim through
      // the frozen LibraryArtifactShape mirror.
      const records = graph.listArtifacts();
      return records.map(projectArtifact);
    },
    async readArtifact(artifactId: string): Promise<LibraryArtifactDetail> {
      const record = graph.readArtifact(artifactId);
      if (record === null) {
        // Typed refusal (the fixture-host law: throw a typed Error
        // with the verbatim reason; the screen's catch path surfaces
        // it as the typed refusal — never a silent no-op, never a
        // stringly null). NEVER fabricate a lineage.
        throw new Error(
          `real host: no artifact ${artifactId} (typed refusal — the registry has no such artifact; never a fabricated lineage)`,
        );
      }
      // The lineage chain is root-first (the Library law). The graph
      // returns it in chain order; the screen's `revisionRows` view
      // marks the head (the last in the chain) per the view law.
      const revisions = await graph.lineage(artifactId);
      return {
        artifact: projectArtifact(record),
        revisions: revisions.map(projectRevision),
        lineageNote: lineageNoteFrom(artifactId, revisions),
      };
    },
  };
}

/**
 * Project one ArtifactRecord into the frozen LibraryArtifactShape
 * mirror. The `editability` class carries VERBATIM (editable /
 * derived-only / opaque — the product language renders it as the
 * record's own value; UI-15; never re-badged).
 */
function projectArtifact(record: ArtifactRecord): LibraryArtifactShape {
  return {
    artifactId: record.artifactId,
    kind: record.kind,
    editability: record.editability,
  };
}

/**
 * Project one ArtifactRevisionRecord into the frozen
 * LibraryRevisionShape mirror. `parentRevisionId` is omitted when
 * undefined (the root revision has no parent — the structural mirror
 * law). `organizationVersion` is omitted when undefined (optional
 * scoping). `toolVersions` and `provenance` carry verbatim.
 */
function projectRevision(
  revision: ArtifactRevisionRecord,
): LibraryRevisionShape {
  const projected: LibraryRevisionShape = {
    revisionId: revision.revisionId,
    artifactId: revision.artifactId,
    ...(revision.parentRevisionId !== undefined
      ? { parentRevisionId: revision.parentRevisionId }
      : {}),
    contentHash: revision.contentHash,
    ...(revision.organizationVersion !== undefined
      ? {
          organizationVersion: {
            organizationId: revision.organizationVersion.organizationId,
            version: revision.organizationVersion.version,
          },
        }
      : {}),
    toolVersions: [...revision.toolVersions],
    provenance: projectProvenance(revision.provenance),
  };
  return projected;
}

/** Project one ProvenanceDescriptor into the frozen mirror. */
function projectProvenance(
  provenance: ArtifactRevisionRecord["provenance"],
): LibraryProvenanceShape {
  const projected: LibraryProvenanceShape = {
    sourceKind: provenance.sourceKind,
    sourceRef: provenance.sourceRef,
    capturedAt: provenance.capturedAt,
  };
  if (provenance.confidence !== undefined) {
    projected.confidence = provenance.confidence;
  }
  return projected;
}

/**
 * Build the lineage note from the real provenance chain. Pure
 * projection over the chain: the unique `<sourceKind>:<sourceRef>`
 * pairs in chain order, joined by ` → `, framed by the real-provenance
 * note. Null only when the chain is empty (the artifact is recorded
 * but has no revisions yet — a honest state, surfaced verbatim).
 */
function lineageNoteFrom(
  artifactId: string,
  revisions: readonly ArtifactRevisionRecord[],
): string | null {
  if (revisions.length === 0) {
    return null;
  }
  const sources: string[] = [];
  const seen = new Set<string>();
  for (const revision of revisions) {
    const key = `${revision.provenance.sourceKind}:${revision.provenance.sourceRef}`;
    if (!seen.has(key)) {
      seen.add(key);
      sources.push(key);
    }
  }
  return `real provenance for ${artifactId} — ${sources.join(" → ")} (immutable lineage preserved; root first, head marked by the view)`;
}
