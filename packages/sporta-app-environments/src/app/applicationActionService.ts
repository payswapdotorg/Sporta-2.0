/**
 * The app action service (app layer, W9C-5) — the single owner of
 * action orchestration over the generic tool seam:
 *
 *   admission (deterministic ladder, typed refusals)
 *   -> confirmation gate (high-impact classes, security law 5)
 *   -> execution (the injected capability-invocation port — the
 *      boundary the ZCode agent path drives)
 *   -> verification (before/after effect evidence; a disconnected or
 *      failed invocation is NEVER successful — P9-19)
 *   -> reconciliation (immutable artifact revision + WorkGraph ref on
 *      the SAME graph the run used, through the injected sink)
 *   -> audit (append-only, sanitized refs only — P9-21).
 *
 * Adapter-free: every IO seam is injected.
 */
import type { SportaId } from "@sporta/contracts/contract";
import type {
  ApplicationActionRecord,
  ApplicationAttachment,
  ApplicationEnvironmentDescriptor,
} from "@sporta/app-environments/contract";
import {
  admitApplicationAction,
  type ApplicationSandboxPolicy,
} from "../domain/admission.js";
import {
  assertAppendOnly,
  buildDeniedActionRecord,
  buildExecutedActionRecord,
  sanitizeInputRefs,
} from "../domain/audit.js";
import { ApplicationActionError } from "../domain/errors.js";
import { sessionMayReportSuccess } from "../domain/sessionLifecycle.js";
import type {
  AppEnvironmentClock,
  AppEnvironmentHashPort,
  ApplicationActionAuditStorePort,
  ApplicationActionOutcome,
  ApplicationActionRequest,
  ApplicationAttachmentStorePort,
  ApplicationCapabilityInvocationPort,
  ApplicationDescriptorStorePort,
  ApplicationEffectSinkPort,
  ApplicationSessionStorePort,
} from "../domain/ports.js";

/** Constructor dependencies — every IO seam injected. */
export interface ApplicationActionServiceDeps {
  clock: AppEnvironmentClock;
  hash: AppEnvironmentHashPort;
  descriptors: ApplicationDescriptorStorePort;
  attachments: ApplicationAttachmentStorePort;
  sessions: ApplicationSessionStorePort;
  audit: ApplicationActionAuditStorePort;
  /** The generic tool seam (REAL local adapter in adapters/). */
  invocation: ApplicationCapabilityInvocationPort;
  /**
   * OPTIONAL verified-effect reconciliation: when present (with a
   * run-scoped attachment), verified control effects are committed as
   * immutable artifact revisions + WorkGraph refs — the TransformRunService
   * optional-deps precedent.
   */
  effectSink?: ApplicationEffectSinkPort;
  /** The environment's sandbox policy (deterministic data). */
  sandbox?: ApplicationSandboxPolicy;
}

export class ApplicationActionService {
  private readonly deps: ApplicationActionServiceDeps;

  constructor(deps: ApplicationActionServiceDeps) {
    this.deps = deps;
  }

  /** Read the append-only audit stream of one session. */
  readAudit(sessionId: SportaId): readonly ApplicationActionRecord[] {
    return this.deps.audit.bySession(sessionId);
  }

  /** Perform one action request (the full orchestration, never a throw for policy denials). */
  async performAction(request: ApplicationActionRequest): Promise<ApplicationActionOutcome> {
    const context = this.resolveContext(request.sessionId);
    const { descriptor, attachment, session } = context;
    const recordedAt = this.deps.clock.now();
    const actionRecordId = this.deriveActionRecordId(
      request.sessionId,
      request.capabilityId,
      recordedAt,
    );
    const declaredCapability =
      descriptor.capabilities.find(
        (candidate) => candidate.capabilityId === request.capabilityId,
      ) ?? null;

    // 1. The deterministic admission ladder (typed refusals).
    const admission = admitApplicationAction(
      {
        now: recordedAt,
        descriptor,
        attachment,
        session,
        sandbox: this.deps.sandbox ?? { deniedPermissions: [] },
      },
      request.capabilityId,
      request.payloadText ?? null,
    );
    if (!admission.admitted) {
      const record = buildDeniedActionRecord({
        actionRecordId,
        session,
        actor: request.actor,
        capabilityId: request.capabilityId,
        capabilityClass: declaredCapability?.capabilityClass ?? "observe",
        targetIdentity: descriptor.targetIdentity,
        admission,
        recordedAt,
      });
      this.appendRecord(record);
      return { admission, record };
    }

    // 2. Confirmation gate (security law 5): high-impact classes need
    //    an explicit confirmed resubmit — recorded as a denial, never executed.
    if (admission.requiresConfirmation && request.confirmed !== true) {
      const record = buildDeniedActionRecord({
        actionRecordId,
        session,
        actor: request.actor,
        capabilityId: request.capabilityId,
        capabilityClass: declaredCapability?.capabilityClass ?? "observe",
        targetIdentity: descriptor.targetIdentity,
        admission,
        recordedAt,
      });
      this.appendRecord(record);
      return { admission, record };
    }

    if (declaredCapability === null) {
      throw new ApplicationActionError(
        `admitted capability ${request.capabilityId} vanished from the descriptor — inconsistent state`,
        "capability-vanished",
      );
    }
    const capability = declaredCapability;

    // 3. Execute through the generic tool seam (sanitized refs only).
    const sanitizedInputRefs = sanitizeInputRefs(request.parameters, (value) =>
      this.deps.hash.text(value),
    );
    const invocation = await this.deps.invocation.invoke({
      descriptor,
      capability,
      parameters: request.parameters,
    });

    // 4. A disconnected target closes the session honestly and can
    //    never report success (P9-19).
    if (invocation.status === "disconnected") {
      const closed = { ...session, closedAt: recordedAt, closeState: "disconnected" as const };
      this.deps.sessions.save(closed);
      const record = buildExecutedActionRecord({
        actionRecordId,
        session: closed,
        actor: request.actor,
        capabilityId: capability.capabilityId,
        capabilityClass: capability.capabilityClass,
        targetIdentity: descriptor.targetIdentity,
        sanitizedInputRefs,
        invocation,
        verified: false,
        verificationNote: "target disconnected",
        reconciliation: null,
        recordedAt,
      });
      this.appendRecord(record);
      return { admission, record };
    }

    // 5. Verify the effect (honest verification law).
    const verification = verifyInvocationEffect(capability.capabilityClass, invocation);
    let reconciliation = null;
    if (invocation.status === "succeeded" && verification.verified) {
      if (!sessionMayReportSuccess(session)) {
        throw new ApplicationActionError(
          `session ${session.sessionId} is ${session.closeState} — success can never be recorded against it (P9-19)`,
          "session-closed",
        );
      }
      // 6. Reconcile the VERIFIED effect onto the run's WorkGraph.
      if (
        invocation.effect !== null &&
        attachment.scope.workGraphId !== null &&
        this.deps.effectSink !== undefined
      ) {
        const workGraphId = attachment.scope.workGraphId;
        reconciliation = await this.deps.effectSink.commitVerifiedEffect({
          sessionId: session.sessionId,
          actionRecordId,
          workGraphId,
          effect: invocation.effect,
          provenance: {
            sourceKind: "agent-run",
            sourceRef: request.actor,
            capturedAt: recordedAt,
          },
          policy: descriptor.policy,
        });
        const checkpoint = this.deps.sessions.byId(session.sessionId);
        if (checkpoint !== null && checkpoint.closeState === "active") {
          this.deps.sessions.save({
            ...checkpoint,
            checkpointRefs: [...checkpoint.checkpointRefs, reconciliation.revisionId],
          });
        }
      }
    }

    // 7. The durable, sanitized audit record.
    const record = buildExecutedActionRecord({
      actionRecordId,
      session,
      actor: request.actor,
      capabilityId: capability.capabilityId,
      capabilityClass: capability.capabilityClass,
      targetIdentity: descriptor.targetIdentity,
      sanitizedInputRefs,
      invocation,
      verified: verification.verified,
      verificationNote: verification.note,
      reconciliation,
      recordedAt,
    });
    this.appendRecord(record);
    return { admission, record };
  }

  private resolveContext(sessionId: SportaId): {
    descriptor: ApplicationEnvironmentDescriptor;
    attachment: ApplicationAttachment;
    session: import("@sporta/app-environments/contract").ApplicationSession;
  } {
    const session = this.deps.sessions.byId(sessionId);
    if (session === null) {
      throw new ApplicationActionError(`session ${sessionId} is unknown`, "session-unknown");
    }
    const attachment = this.deps.attachments.byId(session.attachmentId);
    if (attachment === null) {
      throw new ApplicationActionError(
        `attachment ${session.attachmentId} is unknown`,
        "attachment-unknown",
      );
    }
    const descriptor = this.deps.descriptors.byId(attachment.descriptorId);
    if (descriptor === null) {
      throw new ApplicationActionError(
        `descriptor ${attachment.descriptorId} is unknown`,
        "descriptor-unknown",
      );
    }
    return { descriptor, attachment, session };
  }

  /** Deterministic per-session sequence keeps ids unique and stable. */
  private deriveActionRecordId(
    sessionId: SportaId,
    capabilityId: string,
    recordedAt: string,
  ): SportaId {
    const seq = this.deps.audit.bySession(sessionId).length;
    return `act:${this.deps.hash.text(
      JSON.stringify([sessionId, capabilityId, recordedAt, seq]),
    ).slice(7, 19)}`;
  }

  private appendRecord(record: ApplicationActionRecord): void {
    assertAppendOnly(this.deps.audit.byId(record.actionRecordId), record.actionRecordId);
    this.deps.audit.append(record);
  }
}

/** The honest verification law (pure). */
function verifyInvocationEffect(
  capabilityClass: ApplicationActionRecord["capabilityClass"],
  invocation: import("../domain/ports.js").ApplicationCapabilityInvocationResult,
): { verified: boolean; note: string } {
  if (invocation.status !== "succeeded") {
    return { verified: false, note: `invocation ${invocation.status}` };
  }
  if (capabilityClass === "observe") {
    return invocation.sanitizedOutputRefs.length > 0
      ? { verified: true, note: "observation returned output references" }
      : { verified: false, note: "observation produced no output references" };
  }
  if (invocation.effect === null) {
    return {
      verified: false,
      note: "no before/after effect evidence was observed for a mutating capability",
    };
  }
  return invocation.effect.changed
    ? { verified: true, note: "before/after effect evidence observed and differs" }
    : {
        verified: false,
        note: "before/after effect evidence is identical — no verified mutation",
      };
}
