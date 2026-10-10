/**
 * Seed data for the Sporta host composition (W4C-3).
 *
 * EVIDENCE CLASS: fixture for the CONTENT (intent text, policy values,
 * organization draft fields, the MLT document, the scripted user edit);
 * every REAL leg that consumes them (real spawn, real FS blob store,
 * real MLT parse/serialize/parse round-trip, real HTTP arena, real
 * broker reconcile, real work-graph admission) is real — the fixtures
 * are the data those real legs carry, mirroring the a17-full-real
 * composition's fixtures (packages/sporta-product/test/
 * a17FullRealFixtures.ts).
 */
import type { IntentSpec, PolicySet } from "@sporta/contracts/contract";
// KdenliveProjectState is exported by the editors module (its MLT parser
// owns the type); contracts does not carry it (the a17 test fixture's
// contracts-import of it is a test-only file outside any tsc program).
import type { KdenliveProjectState } from "@sporta/editors/contract";

export const SPORTA_HOST_WORK_GRAPH_ID = "wg:sporta-host";
export const SPORTA_HOST_ORG_ID = "org:sporta-host";
export const SPORTA_HOST_USER = "user:operator";
export const SPORTA_HOST_TENANT = "tenant:operator";

/** Operator policy: render/edit/derive permitted, nothing prohibited. */
export const SPORTA_HOST_POLICY: PolicySet = {
  rights: {
    holders: ["holder:operator"],
    usages: ["render", "edit", "derive"],
    prohibitions: [],
  },
  privacy: { visibility: "tenant", exportableFields: [] },
  retention: { disposition: "retain" },
};

export const SPORTA_HOST_INTENT: IntentSpec = {
  goal: "produce a tactical replay of the authorized clip",
  constraints: ["authorized sources only"],
  artifactRequirements: ["tactical-board-video"],
  learningPolicy: {
    scopes: ["preference", "workflow", "capability", "organization-composition", "knowledge"],
    requireConsent: true,
  },
  policy: SPORTA_HOST_POLICY,
};

/** Organization draft for `version` (fixture fields; registry + promotion are real). */
export function sportaHostOrgDraft(
  version: number,
  learnedPreferences: readonly string[] = [],
) {
  return {
    organizationId: SPORTA_HOST_ORG_ID,
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
    learnedPreferences: [...learnedPreferences],
    evidence: ["evidence:sporta-host-seed"],
    policy: SPORTA_HOST_POLICY,
  };
}

/** The artifact identity the loop renders and the user takes over. */
export const SPORTA_HOST_ARTIFACT_ID = "art:sporta-host";
export const SPORTA_HOST_REVISION_1 = "rev:sporta-host-1";

/** The user-editable project as r1 bytes (a real .kdenlive MLT document). */
export const SPORTA_HOST_INITIAL_MLT_XML = `<?xml version="1.0" encoding="utf-8"?>
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
 * The scripted user edit (PURE transformation of the parsed state): the
 * takeover entry applies this to the current project — import one more
 * clip, extend the timeline entry, adjust a track property. The edit
 * CONTENT is fixture; the parse → mutate → serialize → re-parse chain
 * over it is REAL (asserted by round-trip identity).
 */
export function sportaHostUserEdit(parsed: KdenliveProjectState): KdenliveProjectState {
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
        // Identity lives in attributes.id (KdenlivePlaylist has no `id`
        // field; the a17 test fixture's `playlist.id` compare is a latent
        // no-op there — noted in the wave-4 report for the TL).
        playlist.attributes.id === "playlist_video1"
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
