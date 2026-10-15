/**
 * W12A-1 — the runs screen REAL host (composition-grade). EVIDENCE CLASS:
 * REAL, labeled at the point of use. A pure projection over the REAL
 * TransformRunService ledger (the W12-01 freeze enumeration read):
 * `listRuns()` returns the ledger in insertion order; `readRun(id)`
 * returns the manifest verbatim; typed errors propagate. The ledger's
 * fixture-grade honesty (W9A label) carries to the screen surface via
 * `gradeNote` — never re-badged as more real than it is.
 *
 * State-owner law (the ADR): this host owns NO store, NO ledger, NO
 * second state. The service IS the single run authority; this adapter
 * is a structural projection over its records (the frozen mirror shapes
 * in `runsScreenPorts.ts`). The browser demo mount keeps the labeled
 * fixture host (`runsFixtureHost.ts`) with `backing: "fixture"` — the
 * two are siblings, never replacements.
 *
 * Acceptance: W12-05 (REAL run through the REAL host), W12-06
 * (refused/failed runs stay visible with typed states verbatim), W12-07
 * (the ledger honesty label surfaces — never re-badged).
 */
import type {
  TransformRunManifest,
  TransformRunService,
} from "@sporta/transforms/contract";
import type {
  RunLiveSessionShape,
  RunRecordShape,
  RunStepShape,
  RunsScreenPort,
} from "./runsScreenPorts.js";

/**
 * The REAL runs host. Extends the frozen `RunsScreenPort` with one
 * additive field — `gradeNote` — so the TL composition root can surface
 * the honest ledger grade to the screen (W12-07). The screen that
 * consumes only `RunsScreenPort` keeps compiling; the composition root
 * reads the additive field for the badge.
 */
export interface RunsRealHost extends RunsScreenPort {
  /**
   * Honest grade note carried to the screen surface. Verbatim:
   * `"BACKING: REAL (ledger: fixture-grade in-memory)"` — the run
   * ledger is fixture-grade in-memory (W9A); the host is REAL because
   * it projects over the REAL service, but the ledger honesty label
   * carries, never re-badged.
   */
  readonly gradeNote: string;
}

/** Constructor dependencies (the REAL service; no store owned here). */
export interface CreateRunsRealHostDeps {
  /** The REAL TransformRunService (the single run-ledger authority). */
  service: TransformRunService;
  /**
   * Optional workspace label (informational; surfaces in the refusal
   * reason when a run is unknown, for diagnostic clarity). Defaults to
   * `"tenant-default"` — the run service's own retention default.
   */
  workspace?: string;
}

/**
 * The honesty label carried from W9A — the run ledger is fixture-grade
 * in-memory. The host is REAL (it projects over the REAL service); the
 * ledger honesty label carries, never re-badged (W12-07 law).
 */
export const RUNS_LEDGER_GRADE_NOTE =
  "BACKING: REAL (ledger: fixture-grade in-memory)";

/**
 * Create a REAL runs host over the REAL TransformRunService. The host
 * is a pure projection: service records in, screen-port shapes out.
 * Typed errors propagate verbatim — never swallowed, never stringly.
 *
 * The returned object satisfies `RunsScreenPort` (compile-time proof
 * against the frozen port) AND exposes the additive `gradeNote` for
 * composition-grade wiring (the TL's productComposition.ts reads it
 * for the screen's evidence badge).
 */
export function createRunsRealHost(deps: CreateRunsRealHostDeps): RunsRealHost {
  const { service, workspace = "tenant-default" } = deps;
  return {
    backing: "real",
    gradeNote: RUNS_LEDGER_GRADE_NOTE,
    async listRuns(): Promise<readonly RunRecordShape[]> {
      // W12-01 freeze: the service's listRuns() returns the ledger in
      // insertion order; the private Map IS the ledger (not a second
      // authority). Project every field verbatim through the frozen
      // RunRecordShape mirror.
      const manifests = service.listRuns();
      return manifests.map(projectRunManifest);
    },
    async readRun(runManifestId: string): Promise<RunRecordShape> {
      const manifest = service.readRun(runManifestId);
      if (manifest === null) {
        // Typed refusal (the fixture-host law: throw a typed Error with
        // the verbatim reason; the screen's catch path surfaces it as
        // the typed refusal — never a silent no-op, never a stringly
        // null). The workspace label aids diagnostics.
        throw new Error(
          `real host: no run ${runManifestId} in workspace ${workspace} (typed refusal — the ledger has no such manifest; never a fabricated record)`,
        );
      }
      return projectRunManifest(manifest);
    },
  };
}

/**
 * Project one TransformRunManifest into the frozen RunRecordShape
 * mirror. Every field carries verbatim (the structural mirror law). The
 * manifest's `semanticFidelity.grade` renders as the record's grade
 * (UI-15); refused/failed step statuses stay typed (UI-06 — never
 * softened, never re-badged).
 *
 * `liveSessions` is omitted when the manifest carries none — base
 * manifests from `TransformRunService.runPipeline` carry none; the
 * live-ingress service attaches them and a future live-host adapter
 * would surface them (additive; the field is optional on the mirror).
 */
function projectRunManifest(manifest: TransformRunManifest): RunRecordShape {
  const base: RunRecordShape = {
    runManifestId: manifest.runManifestId,
    workGraph: {
      workGraphId: manifest.workGraph.workGraphId,
      runRef: manifest.workGraph.runRef,
    },
    release: {
      pipelineId: manifest.release.pipelineId,
      version: manifest.release.version,
      releaseDigest: manifest.release.releaseDigest,
    },
    componentDigests: manifest.componentDigests.map((entry) => ({
      nodeId: entry.nodeId,
      digest: entry.digest,
    })),
    configHash: manifest.configHash,
    inputs: manifest.inputs.map((input) => ({
      artifactRef: input.artifactRef,
      rightsSnapshot: input.rightsSnapshot,
    })),
    grantedApplicationCapabilities: [...manifest.grantedApplicationCapabilities],
    steps: manifest.steps.map(projectStep),
    outputs: manifest.outputs.map((output) => ({
      artifactRevisionId: output.artifactRevisionId,
      semanticEvidence: output.semanticEvidence,
    })),
    semanticFidelity: {
      grade: manifest.semanticFidelity.grade,
      note: manifest.semanticFidelity.note,
    },
    startedAt: manifest.startedAt,
    finishedAt: manifest.finishedAt,
    retention: manifest.retention,
  };
  // Additive: liveSessions is attached only when the manifest carries
  // them (the live-ingress service sets the field; base manifests do
  // not). The cast is the structural check — if a future manifest type
  // adds the field, this projection surfaces it verbatim.
  const liveSessions = readLiveSessions(manifest);
  if (liveSessions !== null) {
    return { ...base, liveSessions };
  }
  return base;
}

/**
 * Project one TransformStepResult into the frozen RunStepShape mirror.
 * `provenance` is null when the step has none (typed failure / cancelled
 * steps carry no provenance — the law, not a missing field).
 */
function projectStep(step: TransformRunManifest["steps"][number]): RunStepShape {
  return {
    nodeId: step.nodeId,
    status: step.status,
    timingMs: step.timingMs,
    resourceUse: {
      cpuMs: step.resourceUse.cpuMs,
      memoryMiB: step.resourceUse.memoryMiB,
      outputBytes: step.resourceUse.outputBytes,
    },
    cost:
      step.cost === null
        ? null
        : { amount: step.cost.amount, currency: step.cost.currency },
    detail: step.detail,
    provenance:
      step.provenance === null
        ? null
        : {
            sourceKind: step.provenance.sourceKind,
            sourceRef: step.provenance.sourceRef,
            capturedAt: step.provenance.capturedAt,
            ...(step.provenance.confidence !== undefined
              ? { confidence: step.provenance.confidence }
              : {}),
          },
  };
}

/**
 * Read the live-session evidence off a manifest, if the manifest type
 * carries it. Base `TransformRunManifest` does NOT declare the field;
 * the live-ingress `LiveTransformRunManifest` does. The structural
 * probe keeps this projection forward-compatible without importing the
 * live-ingress module (the frozen port law — no cross-lane imports).
 */
function readLiveSessions(
  manifest: TransformRunManifest,
): readonly RunLiveSessionShape[] | null {
  const maybe = manifest as TransformRunManifest & {
    liveSessions?: readonly unknown[];
  };
  if (maybe.liveSessions === undefined) return null;
  if (!Array.isArray(maybe.liveSessions)) return null;
  return maybe.liveSessions.map((raw) => projectLiveSession(raw));
}

/**
 * Project one live-session record into the frozen RunLiveSessionShape
 * mirror (the structural mirror law). The descriptor's `grade` carries
 * VERBATIM (UI-15 — `real-local-live` renders as `real-local-live`,
 * never inflated to `production`).
 */
function projectLiveSession(raw: unknown): RunLiveSessionShape {
  const session = raw as Record<string, unknown>;
  const descriptor = session.descriptor as Record<string, unknown>;
  const refusal = session.refusal as Record<string, unknown> | null;
  return {
    descriptor: {
      sourceId: String(descriptor.sourceId),
      grade: String(descriptor.grade) as RunLiveSessionShape["descriptor"]["grade"],
      contentKind: String(descriptor.contentKind),
      cadenceMs: Number(descriptor.cadenceMs),
      queueBound: Number(descriptor.queueBound),
    },
    framesConsumed: Number(session.framesConsumed),
    openedAt: String(session.openedAt),
    closedAt:
      session.closedAt === null ? null : String(session.closedAt),
    closeReason: String(session.closeReason) as RunLiveSessionShape["closeReason"],
    refusal:
      refusal === null
        ? null
        : {
            kind: String(refusal.kind),
            detail: String(refusal.detail),
            framesConsumed: Number(refusal.framesConsumed),
          },
  };
}
