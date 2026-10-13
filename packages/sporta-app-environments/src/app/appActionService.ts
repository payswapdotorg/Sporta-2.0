/**
 * W9C-5 — the app action service (app layer). ONE real local app action
 * over the REAL agent/tool path: admission (domain ladder) → before-state
 * read (real adapter IO) → `startRun` on the EXISTING ZCode
 * AgentRuntimeExecutionPort (the only spawn path; no second runtime,
 * lock 37) → poll to the terminal event (the work adapter's law: the
 * verdict is the real process exit code) → after-state read → effect
 * verification → reconciliation into the EXISTING WorkGraph/artifact
 * lineage → append-only audit record.
 *
 * Honesty laws (P9-19/21): a failed or non-terminal run is NEVER
 * successful; an unobserved declared effect is NEVER successful; secrets
 * never enter records; learning consent is never consulted here (lock 31).
 */
import type {
  ApplicationActionAdmissionResult,
  ApplicationActionRecord,
  ApplicationCapabilityClass,
  SportaId,
} from "@sporta/app-environments/contract";
import type { OrganizationVersionRecord } from "@sporta/contracts/contract";
import { admitApplicationAction } from "../domain/admission.js";
import type { ApplicationActionRequest, ApplicationSandboxScope } from "../domain/admission.js";
import {
  assembleActionRecord,
  buildActionRecordId,
  sanitizeActionRefs,
} from "../domain/audit.js";
import type { ApplicationActionEvidence } from "../domain/audit.js";
import {
  ApplicationSessionStateError,
  ApplicationUnknownRecordError,
} from "../domain/errors.js";
import type { ApplicationEnvironmentDescriptor } from "@sporta/app-environments/contract";
import { fnv1aHex, stableStringify } from "../domain/stable.js";
import type {
  AppActionBoundaryPorts,
  AppEnvironmentClock,
  AppEnvironmentHashPort,
  ApplicationActionAuditStorePort,
  ApplicationAttachmentStorePort,
  ApplicationDescriptorStorePort,
  ApplicationSessionStorePort,
  ApplicationTargetStateSnapshot,
} from "../domain/ports.js";

/** Constructor dependencies — every boundary injected, no adapter imports. */
export interface AppActionServiceDeps extends AppActionBoundaryPorts {
  clock: AppEnvironmentClock;
  hash: AppEnvironmentHashPort;
  descriptors: ApplicationDescriptorStorePort;
  attachments: ApplicationAttachmentStorePort;
  sessions: ApplicationSessionStorePort;
  audit: ApplicationActionAuditStorePort;
}

/** Input for one app-action execution attempt. */
export interface ExecuteAppActionInput {
  sessionId: SportaId;
  capabilityId: string;
  /** The class the caller believes it exercises (checked against the declaration). */
  capabilityClass?: ApplicationCapabilityClass;
  actor: string;
  /** Sanitized input references (raw payloads are refused by the sanitizer). */
  inputRefs: readonly string[];
  /** Optional action payload (instruction-injection screened). */
  payload?: string | null;
  /** Session permission scope from the ZCode permission boundary. */
  sandbox: ApplicationSandboxScope;
  /** Explicit confirmation for confirmation-class actions. */
  confirm?: boolean;
  /** The organization the agent run executes under (the ZCode substrate's input). */
  organization: OrganizationVersionRecord;
  /** The WorkGraph carrying this slice's lineage (reconciliation target). */
  workGraphId: SportaId;
  /** The artifact-kind WorkGraph node that carries revision refs (lineage). */
  workGraphArtifactNode: SportaId;
  /** Optional parent for the appended action node (defaults to the run node). */
  actionParentNodeId?: SportaId;
  /** Terminal-event polling deadline (default 30s). */
  runDeadlineMs?: number;
  /** Poll interval (default 25ms). */
  pollIntervalMs?: number;
}

/** The honest result: the admission + the append-only audit record. */
export interface ExecuteAppActionResult {
  admission: ApplicationActionAdmissionResult;
  record: ApplicationActionRecord;
  /** The real agent run (handle + observed events) when one was started. */
  run: { runId: SportaId; events: readonly { type: string; detail: string }[] } | null;
}

const DEFAULT_RUN_DEADLINE_MS = 30_000;
const DEFAULT_POLL_INTERVAL_MS = 25;

export class AppActionService {
  private readonly deps: AppActionServiceDeps;

  constructor(deps: AppActionServiceDeps) {
    this.deps = deps;
  }

  /** Read the append-only audit stream of one session. */
  readAuditTrail(sessionId: SportaId): readonly ApplicationActionRecord[] {
    return this.deps.audit.listBySession(sessionId);
  }

  async executeAppAction(input: ExecuteAppActionInput): Promise<ExecuteAppActionResult> {
    const session = this.deps.sessions.bySessionId(input.sessionId);
    if (session === null) {
      throw new ApplicationUnknownRecordError(
        `no application session ${input.sessionId}`,
        "session",
        input.sessionId,
      );
    }
    const attachment = this.deps.attachments.byAttachmentId(session.attachmentId);
    if (attachment === null) {
      throw new ApplicationUnknownRecordError(
        `session ${input.sessionId} references unknown attachment ${session.attachmentId}`,
        "attachment",
        session.attachmentId,
      );
    }
    const descriptor = this.deps.descriptors.byDescriptorId(attachment.descriptorId);
    const declared = descriptor?.capabilities.find(
      (capability) => capability.capabilityId === input.capabilityId,
    );
    const request: ApplicationActionRequest = {
      sessionId: input.sessionId,
      capabilityId: input.capabilityId,
      capabilityClass: declared?.capabilityClass ?? input.capabilityClass ?? "observe",
      actor: input.actor,
      inputRefs: input.inputRefs,
      payload: input.payload ?? null,
    };
    const admission = admitApplicationAction({
      descriptor,
      attachment,
      session,
      request,
      sandbox: input.sandbox,
      now: this.deps.clock.now(),
    });

    // Denied or unconfirmed confirmation-class actions never execute.
    if (!admission.admitted || (admission.requiresConfirmation && input.confirm !== true)) {
      const record = this.appendAuditRecord(input, request, admission, {
        runVerdict: null,
        beforeDigest: null,
        afterDigest: null,
        newObservations: [],
        declaredSideEffectKinds: declared?.sideEffects ?? [],
        sanitizedOutputRefs: [],
        reconciledRefs: { workGraphId: null, artifactRevisionIds: [] },
        missingCoverageNote: null,
      });
      return { admission, record, run: null };
    }
    if (declared === undefined || descriptor === null) {
      // Unreachable (the ladder refused), kept for the type checker.
      throw new ApplicationUnknownRecordError("capability vanished", "descriptor", attachment.descriptorId);
    }

    // BEFORE state — real adapter read (honest typed failure surfaces).
    const before = await this.deps.targets.readTargetState(descriptor.targetIdentity);

    // The agent run over the EXISTING ZCode boundary: one real spawned
    // process executing the granted action on the real target workspace.
    const directive = stableStringify({
      capabilityId: request.capabilityId,
      capabilityClass: request.capabilityClass,
      action: declared.action,
      targetIdentity: descriptor.targetIdentity,
      targetWorkspacePath: this.deps.targets.targetWorkspacePath(descriptor.targetIdentity),
      inputRefs: sanitizeActionRefs(input.inputRefs).refs,
      payload: input.payload ?? null,
    });
    const handle = await this.deps.agentRuntime.startRun({
      workGraphId: input.workGraphId,
      organization: input.organization,
      task: `Perform the granted application action and report the verified effect: ${directive}`,
    });
    const runEvents = await this.pollToTerminal(handle.runId, input.runDeadlineMs ?? DEFAULT_RUN_DEADLINE_MS, input.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS);
    const terminal = runEvents[runEvents.length - 1];
    const runVerdict: "completed" | "failed" | null =
      terminal !== undefined && (terminal.type === "completed" || terminal.type === "failed")
        ? terminal.type
        : null;

    // AFTER state — the effect evidence read (typed failure surfaces honestly).
    let after: ApplicationTargetStateSnapshot | null = null;
    let readFailureNote: string | null = null;
    try {
      after = await this.deps.targets.readTargetState(descriptor.targetIdentity);
    } catch (cause) {
      readFailureNote = `after-state read failed: ${cause instanceof Error ? cause.message : String(cause)}`;
    }

    // Effect verification + lineage reconciliation (verified success only).
    let reconciled: { workGraphId: SportaId | null; artifactRevisionIds: string[] } = {
      workGraphId: null,
      artifactRevisionIds: [],
    };
    const outputRefs: string[] = [];
    if (after !== null) {
      outputRefs.push(`ref:target-state:${after.stateDigest}`);
    }
    if (runVerdict === "completed" && after !== null && after.stateDigest !== before.stateDigest) {
      try {
        reconciled = await this.reconcile(input, descriptor, handle.runId, after.stateDigest);
        for (const revisionId of reconciled.artifactRevisionIds) {
          outputRefs.push(`ref:artifact-revision:${revisionId}`);
        }
      } catch (cause) {
        readFailureNote = `${readFailureNote === null ? "" : `${readFailureNote}; `}reconciliation failed: ${cause instanceof Error ? cause.message : String(cause)}`;
      }
    }

    const newObservations =
      after === null ? [] : observationsAfterMinusBefore(before.observations, after.observations);
    const timeoutNote =
      runVerdict === null
        ? `agent run ${handle.runId} did not reach a terminal event within ${input.runDeadlineMs ?? DEFAULT_RUN_DEADLINE_MS}ms — a non-terminal run is never successful`
        : readFailureNote;
    const record = this.appendAuditRecord(
      input,
      request,
      admission,
      {
        runVerdict,
        beforeDigest: before.stateDigest,
        afterDigest: after?.stateDigest ?? null,
        newObservations,
        declaredSideEffectKinds: declared.sideEffects,
        sanitizedOutputRefs: outputRefs,
        reconciledRefs: reconciled,
        missingCoverageNote: timeoutNote,
      },
      handle.runId,
    );
    return { admission, record, run: { runId: handle.runId, events: runEvents } };
  }

  /** Poll the run seam to its terminal event (the W4A observation pattern). */
  private async pollToTerminal(
    runId: SportaId,
    deadlineMs: number,
    pollIntervalMs: number,
  ): Promise<readonly { type: string; detail: string }[]> {
    const deadline = Date.now() + deadlineMs;
    for (;;) {
      const events = await this.deps.agentRuntime.observeRun(runId);
      const last = events[events.length - 1];
      if (last !== undefined && (last.type === "completed" || last.type === "failed")) {
        return events.map((event) => ({ type: event.type, detail: event.detail }));
      }
      if (Date.now() > deadline) {
        return events.map((event) => ({ type: event.type, detail: event.detail }));
      }
      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    }
  }

  /**
   * Reconcile the VERIFIED effect into the EXISTING lineage: an evidence
   * artifact revision through the artifact seam + the agent-run/action
   * nodes through the WorkGraph port + the revision ref through the refs
   * port onto the SAME WorkGraph (P9-19).
   */
  private async reconcile(
    input: ExecuteAppActionInput,
    descriptor: ApplicationEnvironmentDescriptor,
    runId: SportaId,
    afterDigest: string,
  ): Promise<{ workGraphId: SportaId | null; artifactRevisionIds: string[] }> {
    const now = this.deps.clock.now();
    const evidence = stableStringify({
      kind: "app-action-effect", workGraphId: input.workGraphId, sessionId: input.sessionId,
      capabilityId: input.capabilityId, targetStateDigest: afterDigest, runId, at: now,
    });
    const contentHash = this.deps.hash.text(evidence);
    const artifactId = `art:app-action:${input.sessionId}:${input.capabilityId}`;
    const revisionId = `rev:${fnv1aHex(`${artifactId}:${contentHash}`)}`;
    await this.deps.artifactRevisions.recordArtifact({
      artifactId,
      kind: "app-action-evidence",
      editability: "derived-only",
      policy: descriptor.policy,
    });
    const lineage = await this.deps.artifactRevisions.lineage(artifactId);
    const parentRevisionId = lineage.length > 0 ? lineage[lineage.length - 1]?.revisionId : undefined;
    const revision = await this.deps.artifactRevisions.commitRevision({
      artifactId,
      revisionId,
      ...(parentRevisionId !== undefined ? { parentRevisionId } : {}),
      contentHash,
      toolVersions: [`sporta-app-environments:${descriptor.appVersion}`],
      provenance: { sourceKind: "agent-run", sourceRef: runId, capturedAt: now },
      policy: descriptor.policy,
    });
    await this.deps.workGraphs.appendNode({
      workGraphId: input.workGraphId,
      nodeId: runId,
      kind: "run",
      actor: { actorKind: "agent-run", actorRef: runId },
    });
    await this.deps.workGraphs.appendNode({
      workGraphId: input.workGraphId,
      nodeId: this.actionNodeId(input),
      kind: "action",
      parent: input.actionParentNodeId ?? runId,
      actor: { actorKind: "agent-run", actorRef: runId },
    });
    await this.deps.workGraphRefs.commitArtifactRevision({
      workGraphId: input.workGraphId,
      nodeId: input.workGraphArtifactNode,
      revisionId: revision.revisionId,
    });
    return { workGraphId: input.workGraphId, artifactRevisionIds: [revision.revisionId] };
  }

  private actionNodeId(input: ExecuteAppActionInput): string {
    return `act-node:${input.sessionId}:${input.capabilityId}`;
  }

  /** Assemble + append the audit record (append-only, idempotent by id). */
  private appendAuditRecord(
    input: ExecuteAppActionInput,
    request: ApplicationActionRequest,
    admission: ApplicationActionAdmissionResult,
    evidence: ApplicationActionEvidence,
    runId?: SportaId,
  ): ApplicationActionRecord {
    const sanitizedInput = sanitizeActionRefs(input.inputRefs);
    const session = this.deps.sessions.bySessionId(input.sessionId);
    if (session === null) {
      throw new ApplicationSessionStateError(`session ${input.sessionId} vanished mid-action`, "session-vanished");
    }
    const attachment = this.deps.attachments.byAttachmentId(session.attachmentId);
    if (attachment === null) {
      throw new ApplicationUnknownRecordError(`attachment ${session.attachmentId} vanished`, "attachment", session.attachmentId);
    }
    const descriptor = this.deps.descriptors.byDescriptorId(attachment.descriptorId);
    const actionRecordId = buildActionRecordId({
      sessionId: input.sessionId,
      capabilityId: request.capabilityId,
      actor: request.actor,
      sanitizedInputRefs: sanitizedInput.refs,
      admissionKey: admissionOutcomeKey(admission),
      effectDigests: [evidence.beforeDigest ?? "none", evidence.afterDigest ?? "none", runId ?? "no-run"],
    });
    const record = assembleActionRecord({
      actionRecordId,
      session,
      attachment,
      actor: request.actor,
      capabilityId: request.capabilityId,
      capabilityClass: request.capabilityClass,
      targetIdentity: descriptor?.targetIdentity ?? "unknown-target",
      admission,
      sanitizedInputRefs: sanitizedInput.refs,
      droppedInputRefCount: sanitizedInput.droppedCount,
      evidence,
      recordedAt: this.deps.clock.now(),
    });
    this.deps.audit.append(record);
    this.deps.sessions.save({
      ...session,
      checkpointRefs: session.checkpointRefs.includes(actionRecordId)
        ? session.checkpointRefs
        : [...session.checkpointRefs, actionRecordId],
    });
    return record;
  }
}

/** Observation records present after but not before (kind+detail fingerprint). */
function observationsAfterMinusBefore(
  before: readonly { kind: string; detail: string }[],
  after: readonly { kind: string; detail: string }[],
): { kind: string; detail: string }[] {
  const beforeFingerprints = new Set(before.map((observation) => `${observation.kind}\u0000${observation.detail}`));
  return after.filter(
    (observation) => !beforeFingerprints.has(`${observation.kind}\u0000${observation.detail}`),
  );
}

/** The stable admission-outcome key for record identity (denials differ by reason). */
function admissionOutcomeKey(admission: ApplicationActionAdmissionResult): string {
  if (admission.admitted) {
    return admission.requiresConfirmation ? `confirm:${admission.confirmationClass}` : "admitted";
  }
  return `refused:${admission.reason}`;
}
