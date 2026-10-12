/**
 * W7C-2 — the local-boot deployment descriptor (SPEC §W7C-2).
 *
 * A typed, HONEST manifest of what `bootSportaLocal` wires: the component
 * list, the port map, the store roots, the required env NAMES (never
 * values or secrets), the health checks, and the hosted-preview entry
 * point. The default descriptor describes THIS local boot as it exists —
 * including the honest dev-mode/auth posture of the WS sink — and is READ
 * by validateDeploymentDescriptor.ts (fail-closed, typed errors).
 */
/** Every component id the local boot can declare (the closed known set). */
export const LOCAL_BOOT_COMPONENT_IDS = [
  "product-host",
  "ws-delta-sink",
  "blob-store",
  "editor-session-store",
  "shared-session-store",
  "run-journal-store",
] as const;

export type LocalBootComponentId = (typeof LOCAL_BOOT_COMPONENT_IDS)[number];

/** The components EVERY honest local boot must wire (fail-closed minimum). */
export const REQUIRED_LOCAL_BOOT_COMPONENTS: readonly LocalBootComponentId[] = [
  ...LOCAL_BOOT_COMPONENT_IDS,
];

/** Relative store-root names under the boot's store root (never absolute, never '..'). */
export interface LocalBootStoreRoots {
  readonly blobs: string;
  readonly editorSessions: string;
  readonly sharedSessions: string;
  readonly runJournals: string;
}

/** The port map (port 0 = OS-assigned, read back and reported in the wiring facts). */
export interface LocalBootPortMap {
  readonly wsDeltaSink: number;
}

/** One health check: which component it proves, and what is checked. */
export interface DeploymentHealthCheck {
  readonly component: LocalBootComponentId;
  readonly check: string;
}

/** The typed local deployment manifest (descriptor schema version 1). */
export interface LocalDeploymentDescriptor {
  /** Manifest name (non-empty). */
  readonly name: string;
  /** Descriptor schema version — currently exactly 1. */
  readonly version: number;
  readonly components: readonly LocalBootComponentId[];
  readonly portMap: LocalBootPortMap;
  readonly storeRoots: LocalBootStoreRoots;
  /** Required env NAMES ONLY — values/secrets are never carried here. */
  readonly requiredEnv: readonly string[];
  /** Optional env names (the WS auth pair — absent = the documented dev-mode law). */
  readonly optionalEnv: readonly string[];
  readonly healthChecks: readonly DeploymentHealthCheck[];
  /** The hosted-preview entry point (a route path, starting with '/'). */
  readonly hostedPreviewEntryPoint: string;
}

/**
 * The DEFAULT local deployment descriptor — the honest manifest of
 * `bootSportaLocal` exactly as wired: every component, the WS delta sink
 * on its default port (0 = OS-assigned unless configured), the four store
 * roots under the caller's store root, the required env names, and the
 * /sporta hosted-preview route (the browser renders through the labeled
 * fixture host in-browser; the headless Node composition behind the route
 * is what this boot wires — the SPEC's honesty law).
 */
export const DEFAULT_LOCAL_DEPLOYMENT_DESCRIPTOR: LocalDeploymentDescriptor = {
  name: "sporta-local",
  version: 1,
  components: [...LOCAL_BOOT_COMPONENT_IDS],
  portMap: { wsDeltaSink: 0 },
  storeRoots: {
    blobs: "blobs",
    editorSessions: "editor-history",
    sharedSessions: "shared-sessions",
    runJournals: "run-journals",
  },
  requiredEnv: [
    "SPORTA_STORE_ROOT",
    "SPORTA_ZCODE_CLI_PATH",
    "SPORTA_ARENA_BASE_URL",
  ],
  optionalEnv: [
    "SPORTA_WS_AUTH_TOKEN",
    "SPORTA_WS_ALLOWED_ORIGINS",
  ],
  healthChecks: [
    { component: "product-host", check: "host.readState() resolves a ProductLoopTrace for the active work graph" },
    { component: "ws-delta-sink", check: "listener bound on a real port (actual port read back and reported)" },
    { component: "blob-store", check: "blob root exists on disk; put/read round-trips byte-identical" },
    { component: "editor-session-store", check: "editor-history root exists on disk; broker appends are durable (fresh-instance read-back)" },
    { component: "shared-session-store", check: "shared-sessions root exists on disk; sessions + coordination ledger readable (fresh instance)" },
    { component: "run-journal-store", check: "run-journals root exists on disk; observed run events replay (fresh instance)" },
  ],
  hostedPreviewEntryPoint: "/sporta",
};
