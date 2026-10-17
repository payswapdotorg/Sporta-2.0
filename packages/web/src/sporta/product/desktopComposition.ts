/**
 * desktopComposition.ts — the W14 TL lane: the REAL composition mounted
 * behind the Sporta desktop window (the Electron main process).
 *
 * HEADLESS Node only — this module NEVER enters the browser bundle (the
 * productComposition law; the renderer reaches these hosts ONLY through
 * the preload IPC bridge, typed by desktopScreenBridge.ts).
 *
 * What this composes (one wiring point, the W12-D/W13 precedents):
 *   - the W12-D `createSportaProductComposition` (the four REAL screen
 *     hosts: runs / library / my-pipelines / connected-apps);
 *   - the W10A `createOperatorStudioHostComposition` (the REAL studio
 *     host with its own studioSeeds world — listings, entitlements,
 *     app attachments, the sample-preview child-process leg);
 *   - the DEMO SEEDS (the studioSeeds precedent: fixture-labeled demo
 *     CONTENT driven through REAL lifecycles — a REAL deterministic
 *     trim run on real pipes with real FS blob writes, a REAL draft +
 *     a REAL submitted marketplace candidate, a REAL attached app the
 *     operator can revoke through the ONE write path). Nothing is
 * faked: every record the screens show was produced by the REAL
 * services; the seed CONTENT is demo, the lifecycle is real.
 *
 * The Home screen keeps its honest fixture host in the browser mount —
 * the full `bootSportaLocal` host leg needs the zcode CLI + arena legs
 * the packaged app cannot ship (recorded typed-future, W13/W14 docs).
 *
 * DEPENDENCY LAW (WO-C1): @sporta/* resolves through the transitional
 * gitignored symlinks; no manifest or lockfile is touched here.
 */
import { promises as fs } from "node:fs";
import type { RunsRealHost } from "../runs/runsRealHost.js";
import type { LibraryRealHost } from "../library/libraryRealHost.js";
import type { MyPipelinesRealHost } from "../marketplace/myPipelinesRealHost.js";
import type { AppsRealHost } from "../apps/appsRealHost.js";
import type { TransformStudioHostPort } from "../studio/studioPorts.js";
import { createSportaProductComposition } from "./productComposition.js";
import { createOperatorStudioHostComposition } from "../studioComposition.js";
import {
  STUDIO_WORKSPACE,
  studioSampleFeedBytes,
  studioSeedDescriptor,
  studioSeedManifest,
} from "../studioSeeds.js";

/** The demo creator the My Pipelines screen queries by default (W11C). */
export const DESKTOP_DEMO_CREATOR = "publisher:fixture-market";

/** Constructor config — the desktop main process supplies every leg. */
export interface SportaDesktopCompositionConfig {
  /** Real directory for the FS blob store legs (the app's userData). */
  readonly blobRoot: string;
  /**
   * The executable the deterministic-filter child legs spawn. The
   * packaged desktop passes its node wrapper
   * (`ELECTRON_RUN_AS_NODE=1 exec <electron binary>`); dev stations
   * default to `process.execPath` (a plain node).
   */
  readonly nodeExecutable?: string;
  /** Skip the demo seeds (honest empty states instead). Default: seed. */
  readonly seed?: boolean;
}

/** The honest boot facts (serialized to the renderer through the bridge). */
export interface SportaDesktopCompositionFacts {
  readonly bootedAt: string;
  readonly blobRoot: string;
  /** Per-leg seed outcomes — "ok" or the verbatim typed failure. */
  readonly seedResults: Readonly<Record<string, string>>;
  readonly ports: {
    readonly runs: { readonly backing: "real"; readonly gradeNote: string };
    readonly library: { readonly backing: "real"; readonly gradeNote: string };
    readonly myPipelines: { readonly backing: "real"; readonly gradeNote: string };
    readonly connectedApps: { readonly backing: "real"; readonly gradeNote: string };
  };
  readonly studio: { readonly evidence: "real" };
}

/** What the desktop composition exposes to the Electron main process. */
export interface SportaDesktopComposition {
  readonly runs: RunsRealHost;
  readonly library: LibraryRealHost;
  readonly myPipelines: MyPipelinesRealHost;
  readonly connectedApps: AppsRealHost;
  readonly studio: TransformStudioHostPort;
  readonly facts: SportaDesktopCompositionFacts;
  dispose(): Promise<void>;
}

/** Run one seed leg honestly: "ok" or the verbatim failure message. */
async function seedLeg(run: () => Promise<unknown>): Promise<string> {
  try {
    await run();
    return "ok";
  } catch (cause) {
    return cause instanceof Error ? cause.message : String(cause);
  }
}

/**
 * Boot the desktop composition. The composition construction itself is
 * fail-closed (a broken store root throws); the SEED legs are honest
 * per-leg (a failed child-process run degrades the demo, never fakes
 * success — the failure string surfaces in the facts).
 */
export async function createSportaDesktopComposition(
  config: SportaDesktopCompositionConfig,
): Promise<SportaDesktopComposition> {
  await fs.mkdir(config.blobRoot, { recursive: true });
  const product = createSportaProductComposition({
    blobRoot: config.blobRoot,
    ...(config.nodeExecutable !== undefined ? { nodeExecutable: config.nodeExecutable } : {}),
  });
  const studio = createOperatorStudioHostComposition(
    config.blobRoot,
    config.nodeExecutable !== undefined ? { nodeExecutable: config.nodeExecutable } : undefined,
  );

  const seedResults: Record<string, string> = {};
  if (config.seed !== false) {
    // --- Runs + Library: ONE REAL deterministic trim run (child process
    // on real pipes; real FS blob writes; real artifact revisions on the
    // same artifact graph the library host projects). The seed CONTENT
    // is the studio sample feed (fixture-labeled); the RUN is real.
    seedResults.runs = await seedLeg(async () => {
      const manifest = await product.services.runService.runPipeline({
        manifest: studioSeedManifest("pipe:desktop-demo"),
        workGraph: { workGraphId: "wg:desktop-demo", runRef: "run:desktop-demo-1" },
        parameters: { "node:trim": { startMs: 1500, endMs: 4500 } },
        inputs: [{
          artifactRef: "art:desktop-demo-feed",
          rightsSnapshot: "rights:desktop-operator",
          bytes: studioSampleFeedBytes(),
          provenance: {
            sourceKind: "authorized-source",
            sourceRef: "source:desktop-demo",
            capturedAt: "2026-10-16T12:00:00.000Z",
            confidence: 0.95,
          },
        }],
        releaseDigest: `sha256:${"a".repeat(63)}1`,
      });
      const failed = manifest.steps.find((step) => step.status !== "succeeded");
      if (failed) {
        throw new Error(
          `desktop demo run did not succeed (step ${failed.nodeId}: ${failed.status})`,
        );
      }
    });
    // Library: one explicit EDITABLE artifact + revision (the run output
    // is derived-only; this shows both editability classes honestly).
    seedResults.library = await seedLeg(async () => {
      await product.services.artifacts.recordArtifact({
        artifactId: "art:desktop-demo-board",
        kind: "tactical-board-video",
        editability: "editable",
        policy: {
          rights: { holders: ["holder:sporta-desktop-demo"], usages: ["render", "derive"], prohibitions: [] },
          privacy: { visibility: "tenant", exportableFields: [] },
          retention: { disposition: "retain" },
        },
      });
      await product.services.artifacts.commitRevision({
        artifactId: "art:desktop-demo-board",
        revisionId: "rev:desktop-demo-1",
        contentHash: `sha256:${"cd".repeat(32)}`,
        organizationVersion: { organizationId: "org:desktop-demo", version: 1 },
        toolVersions: ["sporta@desktop"],
        provenance: {
          sourceKind: "agent-run",
          sourceRef: "run:desktop-demo-1",
          capturedAt: "2026-10-16T12:00:00.000Z",
        },
        policy: {
          rights: { holders: ["holder:sporta-desktop-demo"], usages: ["render", "derive"], prohibitions: [] },
          privacy: { visibility: "tenant", exportableFields: [] },
          retention: { disposition: "retain" },
        },
      });
    });
    // --- Marketplace: a REAL draft + a REAL submitted candidate under
    // the screen's default creator query (the studioSeeds law: demo
    // content through the REAL submission lifecycle).
    seedResults.marketplace = await seedLeg(async () => {
      const { submission } = product.services;
      const draft = submission.startDraft({
        pipelineId: "pipe:desktop-demo-draft",
        version: "1.0.0",
        manifestDigest: studioSeedManifest("pipe:desktop-demo-draft").manifestDigest,
        contentHashes: [{ kind: "code", digest: `sha256:${"0a".repeat(32)}` }],
        attestations: [],
        submittedBy: DESKTOP_DEMO_CREATOR,
      });
      if (draft.lifecycle !== "DRAFT") {
        throw new Error(`desktop demo draft did not start (lifecycle ${draft.lifecycle})`);
      }
      const submitted = submission.startDraft({
        pipelineId: "pipe:desktop-demo-submitted",
        version: "1.0.0",
        manifestDigest: studioSeedManifest("pipe:desktop-demo-submitted").manifestDigest,
        contentHashes: [{ kind: "code", digest: `sha256:${"0b".repeat(32)}` }],
        attestations: [],
        submittedBy: DESKTOP_DEMO_CREATOR,
      });
      submission.submitCandidate(submitted.candidateId);
    });
    // --- Connected apps: one REAL attached app (observe + control) the
    // operator can revoke through the ONE write path. Left unrevoked —
    // the revoke action is the operator's to exercise (honest null
    // revokedAt until then).
    seedResults.apps = await seedLeg(async () => {
      const { environment } = product.services;
      const descriptor = environment.registerDescriptor(
        studioSeedDescriptor(new Date().toISOString()),
      );
      const attached = await environment.consentToAttach({
        attachmentId: "att:desktop-demo-app",
        descriptorId: descriptor.descriptorId,
        consentedBy: "user:operator",
        tenant: "tenant:operator",
        scope: { workspace: STUDIO_WORKSPACE, workGraphId: null },
        grantedCapabilityClasses: ["observe", "control"],
        expiresAt: new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString(),
        policySnapshot: "policy:desktop-demo-v1",
      });
      if (!attached) {
        throw new Error("desktop demo attach did not consent");
      }
    });
    // --- Studio: the composition self-seeds; the first port call awaits
    // it. Probe one read so the facts carry the honest outcome.
    seedResults.studio = await seedLeg(async () => {
      await studio.host.listListings();
    });
  }

  const facts: SportaDesktopCompositionFacts = {
    bootedAt: new Date().toISOString(),
    blobRoot: config.blobRoot,
    seedResults,
    ports: {
      runs: { backing: "real", gradeNote: product.runs.gradeNote },
      library: { backing: "real", gradeNote: product.library.gradeNote },
      myPipelines: { backing: "real", gradeNote: product.myPipelines.gradeNote },
      connectedApps: { backing: "real", gradeNote: product.connectedApps.gradeNote },
    },
    studio: { evidence: "real" },
  };

  return {
    runs: product.runs,
    library: product.library,
    myPipelines: product.myPipelines,
    connectedApps: product.connectedApps,
    studio: studio.host,
    facts,
    dispose: async () => {
      await studio.dispose();
    },
  };
}
