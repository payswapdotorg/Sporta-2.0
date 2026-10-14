/**
 * Connected-Apps screen view-models (W11C — PURE). Projections of the
 * app-environment mirror shapes: granted vs NOT-granted capability
 * classes side by side (capability-class independence is visible —
 * lock 30), the separate learning consent (lock 31), data scope,
 * network posture, expiry/revocation state and audit lines.
 */
import type {
  ConnectedAppAuditShape,
  ConnectedAppView,
} from "./appsScreenPorts.js";

/** Permission summary line (granted classes, revoked/expiry state). */
export function appPermissionSummary(view: ConnectedAppView): string {
  if (view.attachment.revokedAt !== null) {
    return `revoked at ${view.attachment.revokedAt} (was: ${view.attachment.grantedCapabilityClasses.join(", ")})`;
  }
  const granted =
    view.attachment.grantedCapabilityClasses.length > 0
      ? view.attachment.grantedCapabilityClasses.join(", ")
      : "none";
  return `granted: ${granted} — expires ${view.attachment.expiresAt}`;
}

/** The learning-consent line (always explicit, never implied — lock 31). */
export function appLearningConsentLine(view: ConnectedAppView): string {
  const consent = view.attachment.learningConsent;
  if (!consent.granted) {
    return "Learning consent: NOT granted (attaching grants no learning)";
  }
  return `Learning consent: granted — scope ${consent.scope}, retention ${consent.retention}`;
}

/** The data-scope line (data classes + network posture). */
export function appDataScopeLine(view: ConnectedAppView): string {
  const network =
    view.descriptor.networkNeeds === "none"
      ? "no network access"
      : `network: ${view.descriptor.networkNeeds}`;
  return `Data scope: ${view.descriptor.dataClasses.join(", ")} — ${network}`;
}

/** Capability classes the descriptor declares but the grant does NOT carry. */
export function appNotGrantedClasses(view: ConnectedAppView): readonly string[] {
  const granted = new Set(view.attachment.grantedCapabilityClasses);
  return [...new Set(view.descriptor.capabilities.map((capability) => capability.capabilityClass))]
    .filter((clazz) => !granted.has(clazz))
    .sort();
}

/** Whether a mutating class was granted (drives the confirmation copy). */
export function appGrantsMutation(view: ConnectedAppView): boolean {
  const granted = new Set(view.attachment.grantedCapabilityClasses);
  return (
    granted.has("control") ||
    granted.has("file-transfer") ||
    granted.has("network-access") ||
    granted.has("semantic-binding")
  );
}

/** Consent line (who consented, scoped to what, under which policy). */
export function appConsentLine(view: ConnectedAppView): string {
  const scope = view.attachment.scope;
  return (
    `Consented by ${view.attachment.consentedBy} — workspace ${scope.workspace}` +
    (scope.workGraphId !== null ? `, scoped to work graph ${scope.workGraphId}` : ", workspace-wide") +
    ` · policy ${view.attachment.policySnapshot}`
  );
}

/** One audit-trail row (sanitized: no payloads — refs and decisions only). */
export function appAuditLine(record: ConnectedAppAuditShape): string {
  return (
    `${record.recordedAt} — ${record.actor} → ${record.capabilityId} (${record.capabilityClass}): ` +
    `${record.permissionDecision.decision} (${record.permissionDecision.basis}, by ${record.permissionDecision.decidedBy}) · ${record.status}` +
    (record.missingCoverageNote !== null ? ` · coverage note: ${record.missingCoverageNote}` : "")
  );
}

/** Disabled-action reasons (the work-order law: disabled WITH a reason). */
export const APPS_DISABLED_REASONS = {
  attach:
    "Attach is disabled on this screen: attaching is a consented descriptor flow that lives in the app-environment consent path (and the Studio's attach seed at this SHA); this screen inspects and revokes. Recorded in NEXT DEPENDENCIES.",
  invoke:
    "Invoke is disabled on this screen: capability invocation is the agent action lane (ApplicationActionService), never a Library-style screen button. The audit trail shows what the agent actually did.",
} as const;
