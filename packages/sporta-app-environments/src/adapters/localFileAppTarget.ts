/**
 * W9C-5 — the REAL local file-backed app target (adapters layer). The
 * attached application's observable state lives in a REAL local directory
 * (real files, real bytes): `<rootDir>/<identity>/state.json`. This
 * adapter performs the real READS (observation) and exposes the real
 * workspace path for the agent task directive; it NEVER mutates the app
 * state — the app (through the agent's action) owns its internal state
 * (contract law 10). Sporta verifies effects by reading.
 *
 * The only labeled write path is `installDemoAppState` — the demo/test
 * composition installing an application's initial state (fixture-labeled,
 * exactly like seeding an installed app); production apps install their
 * own state.
 */
import { promises as fs } from "node:fs";
import { join } from "node:path";
import type { ContentHash } from "@sporta/contracts/contract";
import { ApplicationTargetStateError } from "../domain/errors.js";
import type {
  AppEnvironmentHashPort,
  ApplicationTargetStatePort,
  ApplicationTargetStateSnapshot,
} from "../domain/ports.js";

/** Constructor dependencies (real fs; root is caller-supplied). */
export interface LocalFileAppTargetDeps {
  /** Real directory root holding one sub-directory per target identity. */
  rootDir: string;
  /** Injected hash port — REAL sha256 over the real state bytes. */
  hash: AppEnvironmentHashPort;
}

export class LocalFileAppTargetAdapter implements ApplicationTargetStatePort {
  private readonly deps: LocalFileAppTargetDeps;

  constructor(deps: LocalFileAppTargetDeps) {
    this.deps = deps;
  }

  /** The real directory this target's state lives in. */
  targetDirectory(targetIdentity: string): string {
    return join(this.deps.rootDir, sanitizeIdentity(targetIdentity));
  }

  /** The agent-facing workspace path (included in the task directive). */
  targetWorkspacePath(targetIdentity: string): string | null {
    return this.targetDirectory(targetIdentity);
  }

  /**
   * Read the target's observable state — REAL bytes, REAL sha256 digest,
   * structured observations derived generically from the parsed state
   * (`state:<key>` kinds). Unreadable/missing state is the typed honest
   * error, never empty evidence.
   */
  async readTargetState(targetIdentity: string): Promise<ApplicationTargetStateSnapshot> {
    const statePath = join(this.targetDirectory(targetIdentity), "state.json");
    let raw: string;
    try {
      raw = await fs.readFile(statePath, "utf8");
    } catch (cause) {
      throw new ApplicationTargetStateError(
        `local app target ${targetIdentity} state unreadable at ${statePath}: ${
          cause instanceof Error ? cause.message : String(cause)
        }`,
        targetIdentity,
      );
    }
    const stateDigest: ContentHash = this.deps.hash.text(raw);
    return { stateDigest, observations: observationsFromState(raw) };
  }

  /**
   * FIXTURE/DEMO-labeled: install an application's initial state (the
   * demo world's "the app is installed with an empty journal"). Only the
   * test/composition roots call this; runtime mutation stays the app's.
   */
  async installDemoAppState(
    targetIdentity: string,
    initialState: Record<string, unknown>,
  ): Promise<void> {
    const directory = this.targetDirectory(targetIdentity);
    await fs.mkdir(directory, { recursive: true });
    await fs.writeFile(
      join(directory, "state.json"),
      `${JSON.stringify(initialState, null, 2)}\n`,
      "utf8",
    );
  }
}

/** Path-safe identity component (no traversal, no separators). */
function sanitizeIdentity(targetIdentity: string): string {
  return targetIdentity.replaceAll(/[^a-zA-Z0-9._-]/g, "_");
}

/**
 * Derive structured observations from the raw state JSON — generic over
 * the state shape: every top-level key yields one `state:<key>`
 * observation whose detail summarizes the value (arrays: length + last
 * entry fingerprint). A changed detail is a NEW observation record — the
 * effect-verification basis (kind must match a declared side effect).
 */
function observationsFromState(raw: string): readonly { kind: string; detail: string }[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [{ kind: "state:unparseable", detail: "state bytes are not JSON" }];
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return [{ kind: "state:root", detail: stablePrimitive(parsed) }];
  }
  return Object.entries(parsed as Record<string, unknown>).map(([key, value]) => ({
    kind: `state:${key}`,
    detail: summarize(value),
  }));
}

function summarize(value: unknown): string {
  if (Array.isArray(value)) {
    const last = value.length > 0 ? value[value.length - 1] : undefined;
    return `${value.length} entries; last: ${stablePrimitive(last)}`;
  }
  if (value !== null && typeof value === "object") {
    return `${Object.keys(value as Record<string, unknown>).length} fields`;
  }
  return stablePrimitive(value);
}

function stablePrimitive(value: unknown): string {
  if (value === undefined) return "none";
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .map(([key, item]) => `${key}=${String(item)}`)
      .join(",");
    return entries.length > 0 ? `{${entries}}` : "{}";
  }
  return String(value);
}
