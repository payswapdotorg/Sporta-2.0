/**
 * Attached-app permission/data-scope view-models (PURE — no react, no
 * IO; W9C-8). Projections of the frozen app-environment records into
 * the studio views: granted vs NOT-granted capability classes side by
 * side (capability-class independence is visible, lock 30), the
 * separate learning-consent state (lock 31), data scope, network
 * needs, licensing and limitations — the app-side P9-12 disclosure.
 */
import type {
  StudioAppAttachmentView,
  StudioAppCapabilityView,
} from "./studioPorts.js";

/** Structural mirror of ApplicationEnvironmentDescriptor (input). */
export interface StudioDescriptorShape {
  descriptorId: string;
  applicationId: string;
  appVersion: string;
  targetKind: string;
  targetIdentity: string;
  dataClasses: readonly string[];
  networkNeeds: string;
  limitations: readonly string[];
  licensing: { license: string; provenance: string };
  capabilities: readonly {
    capabilityId: string;
    capabilityClass: string;
    action: string;
    sideEffects: readonly string[];
    requiredPermissions: readonly string[];
  }[];
}

/** Structural mirror of ApplicationAttachment (input). */
export interface StudioAttachmentShape {
  attachmentId: string;
  descriptorId: string;
  grantedCapabilityClasses: readonly string[];
  grantedAt: string;
  expiresAt: string;
  revokedAt: string | null;
  learningConsent:
    | { granted: false }
    | { granted: true; scope: string; retention: string };
}

/** Project one (descriptor, attachment) pair into the app view. */
export function projectAppAttachment(
  descriptor: StudioDescriptorShape,
  attachment: StudioAttachmentShape,
): StudioAppAttachmentView {
  const granted = new Set(attachment.grantedCapabilityClasses);
  const allClasses = new Set(descriptor.capabilities.map((capability) => capability.capabilityClass));
  const notGranted = [...allClasses].filter((clazz) => !granted.has(clazz)).sort();
  const capabilities: StudioAppCapabilityView[] = descriptor.capabilities.map((capability) => ({
    capabilityId: capability.capabilityId,
    capabilityClass: capability.capabilityClass,
    action: capability.action,
    sideEffects: [...capability.sideEffects],
    requiredPermissions: [...capability.requiredPermissions],
  }));
  return {
    applicationId: descriptor.applicationId,
    appVersion: descriptor.appVersion,
    targetKind: descriptor.targetKind,
    targetIdentity: descriptor.targetIdentity,
    descriptorId: descriptor.descriptorId,
    attachmentId: attachment.attachmentId,
    grantedClasses: [...attachment.grantedCapabilityClasses],
    notGrantedClasses: notGranted,
    grantedAt: attachment.grantedAt,
    expiresAt: attachment.expiresAt,
    revoked: attachment.revokedAt !== null,
    learningConsent:
      attachment.learningConsent.granted
        ? {
            granted: true,
            scope: attachment.learningConsent.scope,
            retention: attachment.learningConsent.retention,
          }
        : { granted: false },
    dataClasses: [...descriptor.dataClasses],
    networkNeeds: descriptor.networkNeeds,
    limitations: [...descriptor.limitations],
    licensing: { ...descriptor.licensing },
    capabilities,
  };
}

/** The permission summary line (granted classes, revoked/expiry state). */
export function permissionSummary(view: StudioAppAttachmentView): string {
  if (view.revoked) return `revoked (was: ${view.grantedClasses.join(", ")})`;
  const granted = view.grantedClasses.length > 0 ? view.grantedClasses.join(", ") : "none";
  return `granted: ${granted} — expires ${view.expiresAt}`;
}

/** The learning-consent line (always explicit, never implied). */
export function learningConsentLine(view: StudioAppAttachmentView): string {
  if (!view.learningConsent.granted) {
    return "Learning consent: NOT granted (attaching grants no learning)";
  }
  return `Learning consent: granted — scope ${view.learningConsent.scope ?? "?"}, retention ${view.learningConsent.retention ?? "?"}`;
}

/** The data-scope line (data classes + network posture). */
export function dataScopeLine(view: StudioAppAttachmentView): string {
  const network =
    view.networkNeeds === "none" ? "no network access" : `network: ${view.networkNeeds}`;
  return `Data scope: ${view.dataClasses.join(", ")} — ${network}`;
}

/** Whether a mutating class was granted (drives the confirmation UI). */
export function grantsMutation(view: StudioAppAttachmentView): boolean {
  return (
    view.grantedClasses.includes("control") ||
    view.grantedClasses.includes("file-transfer") ||
    view.grantedClasses.includes("network-access") ||
    view.grantedClasses.includes("semantic-binding")
  );
}
