/**
 * W9A-4 — the transform run service (app layer). The single owner of
 * run assembly: bounded plan execution, per-step records (the frozen
 * `TransformStepResult`), `TransformRunManifest` pinning (P9-03),
 * in-process carry-forward re-verification (P9-04), partial-output
 * observability (P9-05) and immutable Artifact Fabric revisions
 * (P9-06) through the EXISTING ports — never a second store.
 *
 * Execution composes THROUGH the seams: artifacts via
 * `ArtifactGraphPort` (@sporta/artifacts), optional WorkGraph
 * reconciliation via `WorkGraphRefsPort` (@sporta/work), the model
 * lane via `TransformModelPort`, the deterministic lane via
 * `TransformDeterministicNodePort`. All adapters are injected — the
 * app layer imports no adapter module.
 */
import type {
  ContentHash,
  Iso8601,
  ProvenanceDescriptor,
  SportaId,
} from "@sporta/contracts/contract";
import type { ArtifactBlobStorePort, ArtifactGraphPort } from "@sporta/artifacts/contract";
import type { WorkGraphRefsPort } from "@sporta/work/contract";
import type {
  TransformPipelineManifest,
  TransformRunManifest,
  TransformStepResult,
} from "@sporta/transforms/contract";
import { verifyEventStreamCarryForward } from "../domain/carryForward.js";
import { TransformGraphValidationError, TransformRunError } from "../domain/errors.js";
import { resolveTransformExecutionPlan } from "../domain/executionPlan.js";
import { validateTransformPipelineManifest } from "../domain/graphValidation.js";
import type {
  TransformComponentResolverPort,
  TransformDeterministicNodePort,
  TransformHashPort,
  TransformModelPort,
} from "../domain/ports.js";
import { fnv1aHex, stableStringify } from "../domain/stable.js";

/** Constructor dependencies — every IO seam is injected. */
export interface TransformRunServiceDeps {
  clock: { now(): Iso8601 };
  hash: TransformHashPort;
  artifacts: ArtifactGraphPort;
  models: TransformModelPort;
  deterministic: TransformDeterministicNodePort;
  components: TransformComponentResolverPort;
  /**
   * OPTIONAL blob store: when present, output bytes are PUT through
   * the existing content-addressed fabric seam and the stored hash
   * is verified against the computed one (fail-closed on drift).
   */
  blobs?: ArtifactBlobStorePort;
  /**
   * OPTIONAL WorkGraph reconciliation: when present (with an artifact
   * node id), every committed output revision is appended to that
   * WorkGraph node as an `artifact-revision` ref through the existing
   * port — compose, never duplicate.
   */
  workGraphRefs?: WorkGraphRefsPort;
  /** The WorkGraph artifact node that carries this run's lineage. */
  workGraphArtifactNode?: SportaId;
}

/** One run input: the feed artifact, its rights snapshot and bytes. */
export interface TransformRunInputArtifact {
  artifactRef: string;
  rightsSnapshot: string;
  bytes: Uint8Array;
  provenance: ProvenanceDescriptor | null;
}

/** One bounded pipeline run (see SPEC W9A-4). */
export interface StartTransformRunInput {
  manifest: TransformPipelineManifest;
  workGraph: { workGraphId: SportaId; runRef: string };
  /** Per-node run-time parameters (checked against parameterSchema). */
  parameters: Readonly<Record<string, Readonly<Record<string, unknown>>>>;
  /**
   * First slice: exactly one input artifact feeds the entry node
   * (chain semantics; declared limitation).
   */
  inputs: readonly TransformRunInputArtifact[];
  /** The approved release digest; defaults to the manifest digest. */
  releaseDigest?: ContentHash;
  signal?: AbortSignal;
  maxSteps?: number;
  retention?: string;
}

/**
 * The run service. Runs are assembled honestly: invalid graphs and
 * plan refusals throw before execution; failed steps stop later steps
 * while committed outputs stay readable; cancelled runs never commit.
 */
export class TransformRunService {
  private readonly deps: TransformRunServiceDeps;
  /** Fixture-grade in-memory run ledger (read-back convenience). */
  private readonly runs = new Map<SportaId, TransformRunManifest>();

  constructor(deps: TransformRunServiceDeps) {
    this.deps = deps;
  }

  /** Read a previously assembled run manifest (fixture-grade ledger). */
  readRun(runManifestId: SportaId): TransformRunManifest | null {
    return this.runs.get(runManifestId) ?? null;
  }

  async runPipeline(input: StartTransformRunInput): Promise<TransformRunManifest> {
    if (input.inputs.length !== 1) {
      throw new Error("first slice: exactly one input artifact per run (chain semantics)");
    }
    const feed = input.inputs[0];
    if (feed === undefined) throw new Error("input artifact missing");

    // P9-01 fail-closed at run time: validate WITH the run parameters.
    const validation = validateTransformPipelineManifest(input.manifest, {
      parameters: input.parameters,
    });
    if (!validation.valid) throw new TransformGraphValidationError(validation);

    // W9A-2 bounded plan (typed refusals throw; never partial runs).
    const plan = resolveTransformExecutionPlan(input.manifest, this.deps.components, {
      maxSteps: input.maxSteps,
      parameters: input.parameters,
    });

    const startedAt = this.deps.clock.now();
    const releaseDigest = input.releaseDigest ?? input.manifest.manifestDigest;
    const configHash = this.deps.hash.text(
      stableStringify({
        parameters: input.parameters,
        maxSteps: plan.budget.maxSteps,
        releaseDigest,
      }),
    );
    const runManifestId = `runm:${fnv1aHex(
      stableStringify({
        pipelineId: input.manifest.pipelineId,
        version: input.manifest.version,
        releaseDigest,
        configHash,
        inputs: input.inputs.map((artifact) => artifact.artifactRef),
        startedAt,
      }),
    )}`;

    const steps: TransformStepResult[] = [];
    const outputs: { artifactRevisionId: SportaId; semanticEvidence: string }[] = [];
    let current: { bytes: Uint8Array; provenance: ProvenanceDescriptor | null } = {
      bytes: feed.bytes,
      provenance: feed.provenance,
    };
    let fixtureLaneUsed = false;
    let measuredCarryForward = false;
    let stopped = false;

    for (const step of plan.steps) {
      if (stopped) break;
      if (input.signal?.aborted) {
        steps.push(stepResult(step.nodeId, "cancelled", 0, zeroResources(), null, "run aborted before this step"));
        stopped = true;
        continue;
      }
      const node = input.manifest.nodes.find((candidate) => candidate.nodeId === step.nodeId);
      if (node === undefined) {
        steps.push(stepResult(step.nodeId, "typed-failure", 0, zeroResources(), null, "node vanished from the manifest mid-run"));
        stopped = true;
        continue;
      }

      if (step.lane === "deterministic-process") {
        const executed = await this.deps.deterministic.execute({
          node,
          parameters: { ...input.parameters[step.nodeId] },
          input: current,
          signal: input.signal,
        });
        if (executed.status === "cancelled") {
          steps.push(stepResult(step.nodeId, "cancelled", executed.timingMs, executed.resourceUse, null, executed.detail));
          stopped = true;
          continue;
        }
        if (executed.status === "typed-failure" || executed.outputBytes === null) {
          steps.push(stepResult(step.nodeId, "typed-failure", executed.timingMs, executed.resourceUse, null, executed.detail));
          stopped = true;
          continue;
        }
        // P9-04: re-verify carry-forward in-process before committing.
        const verification = verifyEventStreamCarryForward(current.bytes, executed.outputBytes);
        if (!verification.ok) {
          steps.push(
            stepResult(step.nodeId, "typed-failure", executed.timingMs, executed.resourceUse, null, verification.detail),
          );
          stopped = true;
          continue;
        }
        measuredCarryForward = true;
        const stepProvenance = provenanceFor(node.nodeId, current.provenance, feed.artifactRef, this.deps.clock.now());
        const revision = await this.commitOutput(
          runManifestId,
          input.workGraph.workGraphId,
          node,
          executed.outputBytes,
          stepProvenance,
          input.manifest,
        );
        outputs.push({
          artifactRevisionId: revision,
          semanticEvidence: `${verification.detail}; child trim summary: kept ${executed.summary?.keptCount ?? verification.keptCount}, dropped ${executed.summary?.droppedCount ?? verification.droppedCount}`,
        });
        steps.push(
          stepResult(step.nodeId, "succeeded", executed.timingMs, executed.resourceUse, stepProvenance, `${executed.detail}; ${verification.detail}`),
        );
        current = { bytes: executed.outputBytes, provenance: stepProvenance };
        continue;
      }

      if (step.lane === "model-adapter") {
        const invoked = await this.deps.models.invokeModel({
          modelRef: { name: node.componentRef.name, digest: node.componentRef.digest },
          prompt: new TextDecoder().decode(current.bytes),
          parameters: { ...input.parameters[step.nodeId] },
        });
        const timing = invoked.timingMs;
        const resources = {
          cpuMs: 0,
          memoryMiB: 0,
          outputBytes: invoked.output === null ? 0 : new TextEncoder().encode(invoked.output).length,
        };
        if (invoked.output !== null) {
          if (invoked.evidenceGrade === "fixture") fixtureLaneUsed = true;
          const outBytes = new TextEncoder().encode(invoked.output);
          const modelProvenance: ProvenanceDescriptor = {
            sourceKind: "agent-run",
            sourceRef: `model:${node.componentRef.name}`,
            capturedAt: this.deps.clock.now(),
          };
          const revision = await this.commitOutput(runManifestId, input.workGraph.workGraphId, node, outBytes, modelProvenance, input.manifest);
          outputs.push({
            artifactRevisionId: revision,
            semanticEvidence: `${invoked.evidenceGrade} model lane: ${invoked.detail}`,
          });
          steps.push(stepResult(step.nodeId, "succeeded", timing, resources, modelProvenance, invoked.detail));
          current = { bytes: outBytes, provenance: modelProvenance };
          continue;
        }
        // Refusal lane: the node's declared errorBehavior decides.
        const refusalDetail = invoked.refusal === null ? "no output" : `${invoked.refusal.kind}: ${invoked.refusal.detail}`;
        if (invoked.refusal !== null && node.errorBehavior.mode === "declared-fallback") {
          const stepProvenance = provenanceFor(node.nodeId, current.provenance, feed.artifactRef, this.deps.clock.now());
          const revision = await this.commitOutput(runManifestId, input.workGraph.workGraphId, node, current.bytes, stepProvenance, input.manifest);
          outputs.push({
            artifactRevisionId: revision,
            semanticEvidence: `fallback lane: identity pass-through after ${refusalDetail} (${node.errorBehavior.contract})`,
          });
          steps.push(
            stepResult(step.nodeId, "fallback-used", timing, resources, stepProvenance, `fallback used after model refusal (${refusalDetail}); declared contract: ${node.errorBehavior.contract}`),
          );
          continue;
        }
        steps.push(stepResult(step.nodeId, "typed-failure", timing, resources, null, `model refusal — ${refusalDetail}`));
        stopped = true;
        continue;
      }

      // capability-lane-deferred: honest typed failure, never a silent pass.
      steps.push(
        stepResult(step.nodeId, "typed-failure", 0, zeroResources(), null, `lane "${step.lane}" is deferred to integration (worker C / TL seam) — not available in the first slice`),
      );
      stopped = true;
    }

    const finishedAt = this.deps.clock.now();
    const semanticFidelity = fixtureLaneUsed
      ? { grade: "fixture" as const, note: "fixture model lane produced output (labeled; no real provider)" }
      : measuredCarryForward
        ? { grade: "measured" as const, note: "deterministic lane carry-forward re-verified in-process (byte-exact kept events, counted drops)" }
        : { grade: "declared" as const, note: "no preservation measurement executed this run" };

    const manifest: TransformRunManifest = {
      runManifestId,
      workGraph: { workGraphId: input.workGraph.workGraphId, runRef: input.workGraph.runRef },
      release: {
        pipelineId: input.manifest.pipelineId,
        version: input.manifest.version,
        releaseDigest,
      },
      componentDigests: input.manifest.nodes.map((node) => ({
        nodeId: node.nodeId,
        digest: node.componentRef.digest,
      })),
      configHash,
      inputs: input.inputs.map((artifact) => ({
        artifactRef: artifact.artifactRef,
        rightsSnapshot: artifact.rightsSnapshot,
      })),
      grantedApplicationCapabilities: [],
      steps,
      outputs,
      semanticFidelity,
      startedAt,
      finishedAt,
      retention: input.retention ?? "tenant-default",
    };
    this.runs.set(runManifestId, manifest);
    return manifest;
  }

  /**
   * Commit one output through the EXISTING Artifact Fabric port:
   * content-addressed, immutable revision; deterministic revision ids
   * make retries idempotent. Optional WorkGraph reconciliation appends
   * the artifact-revision ref through the existing refs port.
   */
  private async commitOutput(
    runManifestId: string,
    workGraphId: SportaId,
    node: TransformPipelineManifest["nodes"][number],
    bytes: Uint8Array,
    provenance: ProvenanceDescriptor,
    manifest: TransformPipelineManifest,
  ): Promise<SportaId> {
    const artifactId = `art:transform:${runManifestId}:${node.nodeId}`;
    let contentHash = this.deps.hash.bytes(bytes);
    if (this.deps.blobs !== undefined) {
      const storedHash = await this.deps.blobs.put(bytes);
      if (storedHash !== contentHash) {
        throw new TransformRunError(
          `blob store returned ${storedHash} but the computed content hash is ${contentHash} — refusing to commit drifting bytes`,
          `blob-hash-drift:${artifactId}`,
          runManifestId,
        );
      }
      contentHash = storedHash;
    }
    const revisionId = `rev:${fnv1aHex(`${artifactId}:${contentHash}`)}`;
    await this.deps.artifacts.recordArtifact({
      artifactId,
      kind: "transform-output",
      editability: "derived-only",
      policy: manifest.policy,
    });
    // Lineage law: a further revision on the same artifact chains onto
    // the current head (prior revisions stay readable, never rewritten).
    const lineage = await this.deps.artifacts.lineage(artifactId);
    const parentRevisionId = lineage.length > 0 ? lineage[lineage.length - 1]?.revisionId : undefined;
    const revision = await this.deps.artifacts.commitRevision({
      artifactId,
      revisionId,
      ...(parentRevisionId !== undefined ? { parentRevisionId } : {}),
      contentHash,
      toolVersions: [`sporta-transforms:${node.componentRef.digest}`],
      provenance,
      policy: manifest.policy,
    });
    if (this.deps.workGraphRefs !== undefined && this.deps.workGraphArtifactNode !== undefined) {
      await this.deps.workGraphRefs.commitArtifactRevision({
        workGraphId,
        nodeId: this.deps.workGraphArtifactNode,
        revisionId: revision.revisionId,
      });
    }
    return revision.revisionId;
  }
}

/** Build one frozen `TransformStepResult`. */
function stepResult(
  nodeId: string,
  status: TransformStepResult["status"],
  timingMs: number,
  resourceUse: TransformStepResult["resourceUse"],
  provenance: ProvenanceDescriptor | null,
  detail: string,
): TransformStepResult {
  return { nodeId, status, timingMs, resourceUse, cost: null, detail, provenance };
}

function zeroResources(): TransformStepResult["resourceUse"] {
  return { cpuMs: 0, memoryMiB: 0, outputBytes: 0 };
}

/** Carried-forward provenance, or a synthesized measurement descriptor. */
function provenanceFor(
  nodeId: string,
  carried: ProvenanceDescriptor | null,
  sourceRef: string,
  capturedAt: Iso8601,
): ProvenanceDescriptor {
  if (carried !== null) return carried;
  return { sourceKind: "measurement", sourceRef: `${sourceRef}:${nodeId}`, capturedAt };
}
