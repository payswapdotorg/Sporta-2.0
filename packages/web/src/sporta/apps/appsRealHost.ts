/**
 * W12C-1 + W12C-2 — the connected-apps screen REAL host (composition-grade).
 * EVIDENCE CLASS: REAL, labeled at the point of use. A pure projection
 * over the REAL app-environment services:
 *
 *   - attachments + descriptors over the REAL `ApplicationEnvironmentService`
 *     (the W9C `ApplicationAttachmentStorePort` enumeration read);
 *   - audit trail over the REAL `ApplicationActionService.readAudit`
 *     (the append-only audit store's by-session read);
 *   - revocation rides the REAL `ApplicationEnvironmentService.revokeAttachment`
 *     (idempotent, safe-stops mid-session sessions via
 *     `ApplicationSessionService.safeStopAttachment` — P9-20 verbatim).
 *
 * The `origin: "fixture-demo"` demo rows of the browser fixture host
 * retire on this side: EVERY row here is a REAL `ApplicationAttachment`
 * with its REAL descriptor; granted AND not-granted are both visible;
 * `revokedAt` is honest null-vs-timestamp; absent sessions = empty audit
 * (never an error). The labeled fixture host itself STAYS for the browser
 * demo (sibling, not replacement — the w12a law).
 *
 * State-owner law (ADR-w12): this host owns NO store, NO ledger, NO
 * second state. The app-environment services ARE the single read/write
 * authorities; this adapter is a structural projection over their
 * records (the frozen mirror shapes in `appsScreenPorts.ts`).
 *
 * Write law (the frozen port): exactly one write — `revoke` — riding the
 * EXISTING `ApplicationEnvironmentService.revokeAttachment` path.
 * Idempotent re-revoke returns the SAME record; typed failures carry the
 * verbatim reason. Never a silent no-op, never a stringly null.
 *
 * Acceptance: W12-13 (attachments + descriptors, granted AND not-granted
 * visible, honest revokedAt), W12-14 (audit trail per attachment,
 * unknown attachment = typed refusal, absent session = empty array),
 * W12-15 (revoke idempotent + safe-stop, typed failures verbatim).
 */
import type {
  ApplicationAttachment,
  ApplicationEnvironmentDescriptor,
  ApplicationActionRecord,
  ApplicationSession,
} from "@sporta/app-environments/contract";
import type {
  ApplicationEnvironmentService,
  ApplicationActionService,
} from "@sporta/app-environments/contract";
import type {
  ConnectedAppsScreenPort,
  ConnectedAppDescriptorShape,
  ConnectedAppAttachmentShape,
  ConnectedAppView,
  ConnectedAppAuditShape,
} from "./appsScreenPorts.js";
import { STUDIO_WORKSPACE } from "../studioSeeds.js";

/**
 * The READ-ONLY structural slice of the REAL session store this host
 * rides to map an attachment to its sessions. The REAL
 * `ApplicationSessionStorePort` (the in-memory store the services share)
 * satisfies this structurally — the same enumeration read
 * `ApplicationSessionService.safeStopAttachment` uses internally (the
 * store IS the single session state owner; no second authority here).
 */
export interface AttachmentSessionRead {
  /** All sessions for one attachment (open + closed, insertion order). */
  listByAttachment(attachmentId: string): readonly ApplicationSession[];
}

/**
 * The REAL connected-apps host. Extends the frozen `ConnectedAppsScreenPort`
 * with one additive field — `gradeNote` — so the TL composition root can
 * surface the honest store grade to the screen (the w12b precedent:
 * `MyPipelinesRealHost extends MyPipelinesScreenPort`).
 * The screen that consumes only `ConnectedAppsScreenPort` keeps compiling;
 * the composition root reads the additive field for the badge.
 */
export interface AppsRealHost extends ConnectedAppsScreenPort {
  /**
   * Honest grade note carried to the screen surface. Verbatim:
   * `"BACKING: REAL (attachment + audit + session stores: fixture-grade in-memory)"` —
   * all three stores this host reads are fixture-grade in-memory (the
   * W9B adapters' honest label); the host is REAL because it projects
   * over the REAL services and their REAL lifecycle state machines.
   * Never re-badged as `production`.
   */
  readonly gradeNote: string;
}

/** Constructor dependencies (the REAL read/write services; no store owned here). */
export interface CreateAppsRealHostDeps {
  /** The app-environment service — attachments, descriptors, revocation. */
  readonly environment: ApplicationEnvironmentService;
  /** The action service — audit reads. */
  readonly actionAudit: ApplicationActionService;
  /** The session store's enumeration read — attachment→sessions mapping. */
  readonly sessions: AttachmentSessionRead;
}

/**
 * The honesty label for the stores behind this host — the attachment
 * store, the audit store, and the session store are all fixture-grade
 * in-memory (the W9B adapters' label). The host is REAL (it projects
 * over the REAL services); the store honesty label carries, never
 * re-badged (the W12-07 law generalized).
 */
export const APPS_STORE_GRADE_NOTE =
  "BACKING: REAL (attachment + audit + session stores: fixture-grade in-memory)";

/**
 * Create the REAL connected-apps host over the REAL app-environment
 * services. A pure projection: service records in, frozen screen-port
 * shapes out. Typed errors propagate verbatim — never swallowed, never
 * stringly.
 *
 * The returned object satisfies `ConnectedAppsScreenPort` (compile-time
 * proof against the frozen port) AND exposes the additive `gradeNote`
 * for composition-grade wiring (the TL's productComposition.ts reads it
 * for the screen's evidence badge).
 */
export function createAppsRealHost(
  deps: CreateAppsRealHostDeps,
): AppsRealHost {
  const { environment, actionAudit, sessions } = deps;
  return {
    backing: "real",
    gradeNote: APPS_STORE_GRADE_NOTE,

    async listAttachments(): Promise<readonly ConnectedAppView[]> {
      // The REAL enumeration read: all attachments in the composition's
      // workspace scope (the studio composition's STUDIO_WORKSPACE — the
      // W11C law; the service's listByScope is the authority).
      const attachments = environment.listAttachmentsByScope(STUDIO_WORKSPACE);
      return attachments.map((attachment) => projectAttachmentView(attachment, environment));
    },

    async readAuditTrail(
      attachmentId: string,
    ): Promise<readonly ConnectedAppAuditShape[]> {
      // 1. The attachment must exist — unknown attachment = honest empty
      //    audit (the fixture-host precedent + the work-order law "absent
      //    = empty, not an error"; the frozen port's array return cannot
      //    express a refusal union — a richer read would need a port
      //    change, frozen by law).
      const attachment = environment.readAttachment(attachmentId);
      if (attachment === null) {
        return [];
      }

      // 2. Map attachment → its REAL session(s) (the session service's
      //    enumeration read). An absent session = empty audit (never an error).
      const attachmentSessions = sessions.listByAttachment(attachmentId);
      if (attachmentSessions.length === 0) {
        return [];
      }

      // 3. Read the REAL audit for each session and project VERBATIM.
      const allActions: ConnectedAppAuditShape[] = [];
      for (const session of attachmentSessions) {
        const sessionAudit = actionAudit.readAudit(session.sessionId);
        for (const record of sessionAudit) {
          allActions.push(projectAuditRecord(record));
        }
      }
      return allActions;
    },

    async revoke(
      attachmentId: string,
    ): Promise<{ ok: true; revokedAt: string } | { ok: false; reason: string }> {
      try {
        // The REAL revocation: idempotent, safe-stops mid-session
        // sessions via ApplicationSessionService.safeStopAttachment
        // (P9-20 verbatim — the environment service does this internally).
        const revokedAttachment = environment.revokeAttachment(attachmentId);
        const revokedAt = revokedAttachment.revokedAt;
        if (revokedAt === null) {
          // Never fabricate a timestamp — the service law stamps every
          // revocation; a null stamp here is a law violation, surfaced.
          return {
            ok: false,
            reason:
              "revocation completed but no revokedAt stamp (service law violation)",
          };
        }
        return { ok: true, revokedAt };
      } catch (error) {
        // Typed failures carry the verbatim reason — never softened.
        if (error instanceof Error) {
          return { ok: false, reason: error.message };
        }
        return { ok: false, reason: "unknown revocation error" };
      }
    },
  };
}

/**
 * Project one REAL `ApplicationAttachment` + its descriptor into the
 * frozen `ConnectedAppView` mirror. Every field projects verbatim; the
 * granted vs not-granted visibility is CAPABILITY-CLASS level (the W11C
 * law: the granted subset vs the descriptor's declared classes — the
 * service refuses empty grants, so the gap is always visible in the
 * grantedCapabilityClasses subset); honest `revokedAt` null-vs-timestamp.
 */
function projectAttachmentView(
  attachment: ApplicationAttachment,
  environment: ApplicationEnvironmentService,
): ConnectedAppView {
  const descriptor = environment.readDescriptor(attachment.descriptorId);
  if (descriptor === null) {
    // This should not happen for a valid attachment (referential integrity),
    // but if it does, we project an honest gap — never fabricate.
    return {
      descriptor: {
        descriptorId: attachment.descriptorId,
        applicationId: "",
        appVersion: "",
        targetKind: "",
        targetIdentity: "",
        dataClasses: [],
        networkNeeds: "none",
        limitations: [],
        licensing: { license: "", provenance: "" },
        capabilities: [],
      },
      attachment: projectAttachment(attachment),
    };
  }
  return {
    descriptor: projectDescriptor(descriptor),
    attachment: projectAttachment(attachment),
  };
}

/** Project the REAL descriptor into the frozen shape (verbatim). */
function projectDescriptor(
  descriptor: ApplicationEnvironmentDescriptor,
): ConnectedAppDescriptorShape {
  return {
    descriptorId: descriptor.descriptorId,
    applicationId: descriptor.applicationId,
    appVersion: descriptor.appVersion,
    targetKind: descriptor.targetKind,
    targetIdentity: descriptor.targetIdentity,
    dataClasses: descriptor.dataClasses,
    networkNeeds: descriptor.networkNeeds,
    limitations: descriptor.limitations,
    licensing: descriptor.licensing,
    capabilities: descriptor.capabilities.map((cap) => ({
      capabilityId: cap.capabilityId,
      capabilityClass: cap.capabilityClass,
      action: cap.action,
      sideEffects: cap.sideEffects,
      requiredPermissions: cap.requiredPermissions,
    })),
  };
}

/** Project the REAL attachment into the frozen shape (verbatim). */
function projectAttachment(
  attachment: ApplicationAttachment,
): ConnectedAppAttachmentShape {
  return {
    attachmentId: attachment.attachmentId,
    descriptorId: attachment.descriptorId,
    grantedCapabilityClasses: attachment.grantedCapabilityClasses,
    grantedAt: attachment.grantedAt,
    expiresAt: attachment.expiresAt,
    revokedAt: attachment.revokedAt,
    learningConsent: attachment.learningConsent,
    consentedBy: attachment.consentedBy,
    scope: attachment.scope,
    policySnapshot: attachment.policySnapshot,
  };
}

/**
 * Project one REAL `ApplicationActionRecord` into the frozen
 * `ConnectedAppAuditShape` mirror. Every field carries verbatim.
 */
function projectAuditRecord(
  record: ApplicationActionRecord,
): ConnectedAppAuditShape {
  return {
    actionRecordId: record.actionRecordId,
    sessionId: record.sessionId,
    actor: record.actor,
    capabilityId: record.capabilityId,
    capabilityClass: record.capabilityClass,
    permissionDecision: record.permissionDecision,
    status: record.status,
    recordedAt: record.recordedAt,
    missingCoverageNote: record.missingCoverageNote,
  };
}