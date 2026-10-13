/**
 * The REAL local application adapter (adapters layer, W9C-6/7).
 *
 * Owns ALL process/IO mechanics for CLI-style LOCAL applications
 * (targetKind "local"): every interaction spawns the app program as a
 * REAL child process (real pipes, real exit codes, real wall time —
 * the zcodeAgentRuntime/deterministicFilterNode precedent). The app
 * program itself is external content (user-installed); its declared
 * self-description is mapped onto the frozen Sporta capability
 * vocabulary here — mutates:false -> observe, mutates:true -> control
 * (the class vocabulary stays authoritative; observation never
 * implies mutation).
 *
 * Effect verification is REAL: the app's own state file (declared in
 * its self-description) is read before/after each invocation and the
 * byte-level difference is the effect evidence. Spawn failures are
 * typed `disconnected` (never "successful"); non-zero exits are typed
 * `failed`; nothing is fabricated.
 *
 * Sandbox posture: the app process runs with env {} (no host
 * secrets), cwd limited to its own directory, and a bounded timeout.
 */
import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import { join } from "node:path";
import type { ContentHash, PolicySet } from "@sporta/contracts/contract";
import type {
  ApplicationCapability,
  ApplicationCapabilityClass,
  ApplicationEnvironmentDescriptor,
} from "@sporta/app-environments/contract";
import { ApplicationRegistryError } from "../domain/errors.js";
import type {
  AppEnvironmentClock,
  AppEnvironmentHashPort,
  ApplicationCapabilityInvocationPort,
  ApplicationCapabilityInvocationResult,
  ApplicationInvocationEffect,
} from "../domain/ports.js";

/** The app's own declared action (external content, mapped not trusted). */
export interface LocalAppDeclaredAction {
  action: string;
  mutates: boolean;
  summary: string;
  inputs: readonly { name: string; kind: string; required: boolean }[];
  outputs: readonly { name: string; kind: string }[];
  failures?: readonly string[];
}

/** The app's self-description printed by its `describe` command. */
export interface LocalAppSelfDescription {
  applicationId: string;
  appVersion: string;
  /** State file (relative to the app dir) the app owns and mutates. */
  stateFile: string | null;
  actions: readonly LocalAppDeclaredAction[];
}

/** Constructor dependencies (all injectable; real IO defaults). */
export interface LocalApplicationAdapterDeps {
  /** The REAL app program (a user-installed local executable script). */
  appExecutable: string;
  /** The app's own directory (cwd for spawns; state file lives here). */
  appDirectory: string;
  clock: AppEnvironmentClock;
  hash: AppEnvironmentHashPort;
  /** Node executable used to run the app script (default: this process). */
  nodeExecutable?: string;
  /** Per-invocation wall-clock ceiling (default 10s). */
  timeoutMs?: number;
  /** Temp-free seam for tests (default: real fs). */
  readFile?: (path: string) => Promise<Uint8Array>;
}

interface SpawnOutcome {
  code: number | null;
  signal: string | null;
  error: string | null;
  stdout: string;
  stderr: string;
}

/** REAL local app adapter over the generic invocation port. */
export class LocalApplicationAdapter implements ApplicationCapabilityInvocationPort {
  private readonly deps: LocalApplicationAdapterDeps;

  constructor(deps: LocalApplicationAdapterDeps) {
    this.deps = deps;
  }

  /** Read the app's REAL self-description (one real spawn). */
  async describeTarget(): Promise<LocalAppSelfDescription> {
    const outcome = await this.spawnApp(["describe"]);
    if (outcome.error !== null) {
      throw new ApplicationRegistryError(
        `local app at ${this.deps.appExecutable} could not be started: ${outcome.error}`,
        "app-unstartable",
      );
    }
    if (outcome.code !== 0) {
      throw new ApplicationRegistryError(
        `local app describe exited ${String(outcome.code)}: ${outcome.stderr.trim().slice(0, 256)}`,
        "app-describe-failed",
      );
    }
    return parseSelfDescription(outcome.stdout);
  }

  /** REAL target probe: describe + identity/version match. */
  async probeTarget(
    descriptor: Pick<ApplicationEnvironmentDescriptor, "applicationId" | "appVersion">,
  ): Promise<{ reachable: boolean; detail: string }> {
    try {
      const description = await this.describeTarget();
      if (description.applicationId !== descriptor.applicationId) {
        return {
          reachable: false,
          detail: `app reports identity ${description.applicationId}, descriptor declares ${descriptor.applicationId}`,
        };
      }
      if (description.appVersion !== descriptor.appVersion) {
        return {
          reachable: false,
          detail: `app reports version ${description.appVersion}, descriptor declares ${descriptor.appVersion}`,
        };
      }
      return { reachable: true, detail: `real describe probe matched ${descriptor.applicationId}@${descriptor.appVersion}` };
    } catch (error) {
      return {
        reachable: false,
        detail: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Build the frozen descriptor from a REAL probe merged with
   * product-side fields (workspace binding, policy, licensing). The
   * capability catalog is mapped from the app's declared actions —
   * never invented here.
   */
  async buildDescriptorFromProbe(input: {
    descriptorId: string;
    workspaceBinding: { tenant: string; workspace: string };
    policy: PolicySet;
    licensing: { license: string; provenance: string };
    limitations: readonly string[];
    dataClasses: readonly string[];
    launchRequirements?: readonly string[];
  }): Promise<ApplicationEnvironmentDescriptor> {
    const description = await this.describeTarget();
    const capabilities = description.actions.map((action) => mapDeclaredAction(action, description));
    return {
      descriptorId: input.descriptorId,
      applicationId: description.applicationId,
      providerAdapterId: "adapter:local-process",
      appVersion: description.appVersion,
      targetKind: "local",
      targetIdentity: this.deriveTargetIdentity(description),
      workspaceBinding: input.workspaceBinding,
      capabilities,
      launchRequirements: input.launchRequirements ?? [
        `local app installed at ${this.deps.appExecutable}`,
      ],
      dataClasses: input.dataClasses,
      networkNeeds: "none",
      licensing: input.licensing,
      health: { checkedAt: this.deps.clock.now(), status: "healthy" },
      limitations: input.limitations,
      policy: input.policy,
    };
  }

  /** REAL capability invocation: before-state, spawn, after-state. */
  async invoke(input: {
    descriptor: Pick<ApplicationEnvironmentDescriptor, "capabilities" | "applicationId">;
    capability: ApplicationCapability;
    parameters: Readonly<Record<string, unknown>>;
  }): Promise<ApplicationCapabilityInvocationResult> {
    const description = await this.describeTarget().catch(() => null);
    const statePath =
      description !== null && description.stateFile !== null
        ? join(this.deps.appDirectory, description.stateFile)
        : null;
    const before = statePath === null ? "absent" : await this.readState(statePath);
    const payload = JSON.stringify({ ...input.parameters });
    const outcome = await this.spawnApp([input.capability.action, payload]);

    if (outcome.error !== null) {
      return {
        status: "disconnected",
        failureKind: "spawn-error",
        detail: `local app could not be started: ${outcome.error}`,
      };
    }
    if (outcome.code !== 0) {
      return {
        status: "failed",
        failureKind: `app-exit-${outcome.code ?? "signal"}`,
        detail: outcome.stderr.trim().length > 0
          ? outcome.stderr.trim().slice(0, 256)
          : `app action "${input.capability.action}" exited ${String(outcome.code)}`,
      };
    }
    let response: { ok?: unknown; output?: unknown; error?: unknown };
    try {
      response = JSON.parse(outcome.stdout) as typeof response;
    } catch {
      return {
        status: "failed",
        failureKind: "app-response-unparseable",
        detail: `app printed non-JSON output: ${outcome.stdout.slice(0, 256)}`,
      };
    }
    if (response.ok !== true) {
      return {
        status: "failed",
        failureKind: "app-reported-failure",
        detail: typeof response.error === "string" ? response.error : "app reported a failure",
      };
    }
    const after = statePath === null ? "absent" : await this.readState(statePath);
    const outputText = JSON.stringify(response.output ?? null);
    const effect: ApplicationInvocationEffect | null =
      statePath === null
        ? null
        : {
            kind: input.capability.capabilityClass === "observe" ? "app-observation" : "app-state-mutation",
            beforeSummary: before.slice(0, 256),
            afterSummary: after.slice(0, 256),
            changed: before !== after,
            evidenceBytes: new TextEncoder().encode(
              JSON.stringify({
                kind: input.capability.capabilityClass === "observe" ? "app-observation" : "app-state-mutation",
                applicationId: input.descriptor.applicationId,
                action: input.capability.action,
                before: before.slice(0, 4096),
                after: after.slice(0, 4096),
                output: outputText.slice(0, 4096),
              }),
            ),
          };
    return {
      status: "succeeded",
      sanitizedOutputRefs: [`out:${this.deps.hash.text(outcome.stdout).slice(7, 71)}`],
      effect,
      detail: `real app process exited 0 for action "${input.capability.action}"`,
    };
  }

  /** Deterministic install-scoped target identity. */
  private deriveTargetIdentity(description: LocalAppSelfDescription): string {
    const installDigest: ContentHash = this.deps.hash.text(
      `${this.deps.appExecutable}|${this.deps.appDirectory}`,
    );
    return `local:${description.applicationId}@${description.appVersion}:${installDigest.slice(7, 19)}`;
  }

  private async readState(statePath: string): Promise<string> {
    const read = this.deps.readFile ?? ((path: string) => fs.readFile(path));
    try {
      return new TextDecoder().decode(await read(statePath));
    } catch {
      return "absent";
    }
  }

  /** One REAL spawn of the app program (empty env, own cwd, bounded). */
  private spawnApp(args: readonly string[]): Promise<SpawnOutcome> {
    const timeoutMs = this.deps.timeoutMs ?? 10_000;
    return new Promise<SpawnOutcome>((resolve) => {
      const child = spawn(
        this.deps.nodeExecutable ?? process.execPath,
        [this.deps.appExecutable, ...args],
        {
          cwd: this.deps.appDirectory,
          env: {},
          stdio: ["ignore", "pipe", "pipe"],
          timeout: timeoutMs,
          killSignal: "SIGTERM",
        },
      );
      let stdout = "";
      let stderr = "";
      child.stdout?.on("data", (chunk: Buffer) => {
        stdout += chunk.toString();
        if (stdout.length > 65_536) stdout = stdout.slice(0, 65_536);
      });
      child.stderr?.on("data", (chunk: Buffer) => {
        stderr += chunk.toString();
        if (stderr.length > 4096) stderr = stderr.slice(0, 4096);
      });
      child.on("error", (error: Error) => {
        resolve({ code: null, signal: null, error: error.message, stdout, stderr });
      });
      child.on("close", (code: number | null, signal: NodeJS.Signals | null) => {
        resolve({ code, signal: signal ?? null, error: null, stdout, stderr });
      });
    });
  }
}

/** Map one declared app action onto the frozen capability vocabulary. */
function mapDeclaredAction(
  action: LocalAppDeclaredAction,
  description: LocalAppSelfDescription,
): ApplicationCapability {
  if (action.mutates && description.stateFile === null) {
    throw new ApplicationRegistryError(
      `app action "${action.action}" declares a mutation but the app declares no state file — mutating actions need observable state`,
      "app-action-inconsistent",
    );
  }
  const capabilityClass: ApplicationCapabilityClass = action.mutates ? "control" : "observe";
  return {
    capabilityId: `cap:${action.action}`,
    capabilityClass,
    action: action.action,
    inputs: action.inputs.map((input) => ({
      name: input.name,
      dataKind: input.kind,
      required: input.required,
    })),
    outputs: action.outputs.map((output) => ({ name: output.name, dataKind: output.kind })),
    sideEffects: action.mutates ? [`mutates ${description.stateFile ?? ""}`.trim()] : [],
    requiredPermissions: [],
    failures: [...(action.failures ?? ["app-exit-nonzero"])],
  };
}

/** Parse + structurally validate the app's self-description. */
function parseSelfDescription(stdout: string): LocalAppSelfDescription {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    throw new ApplicationRegistryError(
      `app describe output is not JSON: ${stdout.slice(0, 256)}`,
      "app-describe-unparseable",
    );
  }
  const record = parsed as Partial<LocalAppSelfDescription>;
  if (
    typeof record.applicationId !== "string" ||
    typeof record.appVersion !== "string" ||
    !Array.isArray(record.actions) ||
    record.actions.length === 0
  ) {
    throw new ApplicationRegistryError(
      "app self-description is malformed (applicationId/appVersion/actions required)",
      "app-describe-malformed",
    );
  }
  for (const action of record.actions) {
    if (typeof action.action !== "string" || typeof action.mutates !== "boolean") {
      throw new ApplicationRegistryError(
        `app action entry is malformed: ${JSON.stringify(action).slice(0, 256)}`,
        "app-action-malformed",
      );
    }
  }
  return {
    applicationId: record.applicationId,
    appVersion: record.appVersion,
    stateFile: typeof record.stateFile === "string" ? record.stateFile : null,
    actions: record.actions,
  };
}
