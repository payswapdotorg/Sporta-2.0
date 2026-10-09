/**
 * Fixtures + composition root for the A17 full-real loop test
 * (packages/sporta-product/test/a17-full-real.test.ts).
 *
 * EVIDENCE CLASS: the static fixtures (intent, policy, organization
 * drafts, the initial MLT XML document) are fixture-grade data; the
 * composition factory wires the REAL adapters (FsArtifactBlobStore,
 * KdenliveAdapter, HttpArenaTransport, ArenaClientService read seam,
 * LearningIntakeService read seam) exactly as the test drives them.
 */
import { promises as fs } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { IntentSpec, KdenliveProjectState } from "@sporta/contracts/contract";
import type { PolicySet } from "@sporta/contracts/contract";
import { WorkGraphService, InMemoryWorkGraphStore, systemClockNow } from "@sporta/work/contract";
import {
  InMemoryOrganizationStore,
  InMemoryUserPreferenceStore,
  OrganizationRegistryService,
  OrganizationResolverService,
  UserPreferenceService,
} from "@sporta/organizations/contract";
import { EvaluationService } from "@sporta/evaluation/contract";
import {
  ArtifactGraphService,
  FsArtifactBlobStore,
  SystemClock as ArtifactSystemClock,
} from "@sporta/artifacts/contract";
import {
  EditorBrokerService,
  InMemoryEditorSessionStore,
  KdenliveAdapter,
  sha256EditorHash,
  SystemClock as EditorSystemClock,
} from "@sporta/editors/contract";
import { ArenaClientService, HttpArenaTransport } from "@sporta/arena/contract";
import { LearningIntakeService } from "../src/app/learningIntake.js";
import { ProductLoopProjection } from "../src/app/productLoopProjection.js";
import {
  EditorSessionHistoryTrace,
  OrganizationCandidateTrace,
  StubArenaRole,
} from "./a17FullRealSupport.js";

export const STANDIN_PATH = fileURLToPath(
  new URL("./fixtures/zcode-cli-standin.mjs", import.meta.url),
);

export const T0 = "2026-10-07T00:00:00.000Z";

export const WORK_GRAPH_ID = "wg:a17-full";
export const ORG_ID = "org:a17-full";

export const ISO_8601 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/;

export const policy: PolicySet = {
  rights: { holders: ["holder:operator"], usages: ["render", "edit", "derive"], prohibitions: [] },
  privacy: { visibility: "tenant", exportableFields: [] },
  retention: { disposition: "retain" },
};

export const intent: IntentSpec = {
  goal: "produce a tactical replay of the authorized clip",
  constraints: ["authorized sources only"],
  artifactRequirements: ["tactical-board-video"],
  learningPolicy: {
    scopes: ["preference", "workflow", "capability", "organization-composition", "knowledge"],
    requireConsent: true,
  },
  policy,
};

export const orgDraftFor = (version: number) => ({
  organizationId: ORG_ID,
  version,
  intentProfile: "sports-replay",
  roleGraph: [],
  agentBodies: [],
  cognitiveSubstrates: [],
  toolGraph: [],
  workflowGraph: [],
  environmentProfile: "local",
  fallbacks: [],
  budgets: {},
  learnedPreferences: [] as string[],
  evidence: ["evidence:seed-a17-full"],
  policy,
});

/** A realistic .kdenlive (MLT) document: producers, playlists, tractor, an unknown element carried verbatim. */
export const INITIAL_MLT_XML = `<?xml version="1.0" encoding="utf-8"?>
<mlt LC_NUMERIC="C" version="7.28.0" title="tactical-replay" producer="main_bin">
  <profile description="1920x1080 25.00 fps progressive" width="1920" height="1080" frame_rate_num="25" frame_rate_den="1" progressive="1" colorspace="709"/>
  <producer id="producer0" in="00:00:00.000" out="00:00:05.000">
    <property name="length">125 frames</property>
    <property name="eof">pause</property>
    <property name="resource">/clips/authorized-match-clip.mp4</property>
    <property name="mlt_service">avformat</property>
  </producer>
  <producer id="producer1" in="00:00:00.000" out="00:00:03.000">
    <property name="length">75 frames</property>
    <property name="resource">/clips/tactical-board.png</property>
    <property name="mlt_service">pixbuf</property>
  </producer>
  <playlist id="main_bin">
    <property name="kdenlive:docproperties.activeTrack">0</property>
    <entry producer="producer0" in="00:00:00.000" out="00:00:05.000"/>
    <entry producer="producer1" in="00:00:00.000" out="00:00:03.000"/>
  </playlist>
  <playlist id="playlist_video1">
    <property name="kdenlive:track_name">Video 1</property>
    <blank length="25 frames"/>
    <entry producer="producer0" in="00:00:00.000" out="00:00:02.500"/>
  </playlist>
  <tractor id="tractor_main" in="00:00:00.000" out="00:00:08.000">
    <property name="kdenlive:trackheight">67</property>
    <track producer="playlist_video1"/>
    <transition id="transition0" in="00:00:02.000" out="00:00:04.000">
      <property name="mlt_service">mix</property>
      <property name="a_track">0</property>
      <property name="b_track">1</property>
    </transition>
  </tractor>
</mlt>
`;

/**
 * The scripted user edit, as a PURE transformation of the parsed state:
 * import one more clip, extend the timeline entry, adjust a track property.
 */
export function userEditedState(parsed: KdenliveProjectState): KdenliveProjectState {
  return {
    mlt: {
      ...parsed.mlt,
      producers: [
        ...parsed.mlt.producers,
        {
          attributes: { id: "producer2", in: "00:00:00.000", out: "00:00:02.000" },
          properties: {
            length: "50 frames",
            resource: "/clips/user-imported-replay.mp4",
            mlt_service: "avformat",
          },
          unknown: [],
        },
      ],
      playlists: parsed.mlt.playlists.map((playlist) =>
        playlist.id === "playlist_video1"
          ? {
              ...playlist,
              properties: {
                ...playlist.properties,
                "kdenlive:track_name": "Video 1 (user edit)",
              },
              children: [
                ...playlist.children,
                {
                  type: "entry" as const,
                  attributes: { producer: "producer2", in: "00:00:00.000", out: "00:00:02.000" },
                },
              ],
            }
          : playlist,
      ),
    },
  };
}

/** Recursively count files under one directory (blob-store evidence). */
export async function countFiles(root: string): Promise<number> {
  let count = 0;
  const entries = await fs.readdir(root, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory()) {
      count += await countFiles(join(root, entry.name));
    } else {
      count += 1;
    }
  }
  return count;
}

/** The composition root: REAL adapters where the sandbox permits, fixture stores elsewhere. */
export function buildFullRealComposition(tempRoot: string, arenaRole: StubArenaRole) {
  const workService = new WorkGraphService({
    store: new InMemoryWorkGraphStore(),
    now: systemClockNow,
  });
  const registry = new OrganizationRegistryService({
    store: new InMemoryOrganizationStore(),
    now: systemClockNow,
  });
  const preferences = new UserPreferenceService({
    store: new InMemoryUserPreferenceStore(),
    now: systemClockNow,
  });
  const resolver = new OrganizationResolverService({ catalog: registry, preferences });
  const evaluation = new EvaluationService();
  const artifacts = new ArtifactGraphService(new ArtifactSystemClock());
  const blobStore = new FsArtifactBlobStore(join(tempRoot, "blobs")); // REAL FS store
  const editors = new EditorBrokerService({
    clock: new EditorSystemClock(),
    hash: sha256EditorHash,
    artifactGraph: artifacts,
    sessionStore: new InMemoryEditorSessionStore(),
    adapters: [new KdenliveAdapter(sha256EditorHash)], // the REAL adapter only
  });
  const transport = new HttpArenaTransport({ baseUrl: arenaRole.baseUrl }); // REAL HTTP
  const arena = new ArenaClientService({ transport });
  const learningIntake = new LearningIntakeService({ workGraphs: workService });
  const editorHistory = new EditorSessionHistoryTrace();
  const candidateTrace = new OrganizationCandidateTrace();
  const projection = new ProductLoopProjection({
    workGraphs: workService,
    organizations: resolver,
    artifacts,
    editors,
    arena,
    userRef: "user:operator",
    environmentProfile: "local",
    constraints: [],
    editorSessionHistory: editorHistory,
    learningArtifacts: learningIntake,
    organizationCandidates: candidateTrace,
    escalations: arena,
  });
  return {
    workService,
    registry,
    preferences,
    resolver,
    evaluation,
    artifacts,
    blobStore,
    editors,
    transport,
    arena,
    learningIntake,
    editorHistory,
    candidateTrace,
    projection,
  };
}
