/**
 * The deterministic action-admission ladder (domain — pure, W9C-3).
 *
 * One fixed check order, one typed refusal per step, always the
 * FROZEN ApplicationActionAdmissionResult (fail-closed — the
 * sporta-marketplace admission-ladder idiom):
 *
 *   1. attachment-revoked          (grant state first: the security fact)
 *   2. attachment-expired          (clock-checked, never record-trusted)
 *   3. capability-not-declared     (the descriptor catalog is authoritative)
 *   4. capability-class-not-granted(set membership — observe NEVER implies control)
 *   5. session-closed              (bounded session law)
 *   6. sandbox-policy-denied       (declared permissions vs environment policy)
 *   7. instruction-injection-suspected (app content can never expand grants)
 *
 * Admitted mutating capabilities whose declared side effects map to a
 * high-impact class require explicit confirmation (security law 5).
 */
import type { Iso8601 } from "@sporta/contracts/contract";
import type {
  ApplicationActionAdmissionResult,
  ApplicationCapability,
  ApplicationEnvironmentDescriptor,
  ApplicationSession,
  ApplicationAttachment,
} from "@sporta/app-environments/contract";
import { attachmentStatus, isCapabilityClassGranted } from "./grants.js";

/** Environment sandbox policy for one admission (deterministic data). */
export interface ApplicationSandboxPolicy {
  /** Permissions this environment refuses (e.g. no network egress). */
  deniedPermissions: readonly string[];
}

/** Everything the ladder needs (all injected — no ambient state). */
export interface ApplicationAdmissionContext {
  now: Iso8601;
  descriptor: ApplicationEnvironmentDescriptor;
  attachment: ApplicationAttachment;
  session: ApplicationSession;
  sandbox: ApplicationSandboxPolicy;
}

/** High-impact side-effect vocabulary -> confirmation class (law 5). */
const HIGH_IMPACT_SIDE_EFFECTS: readonly {
  pattern: RegExp;
  confirmationClass: Exclude<
    Extract<ApplicationActionAdmissionResult, { admitted: true; requiresConfirmation: true }>["confirmationClass"],
    never
  >;
}[] = [
  { pattern: /destructive/i, confirmationClass: "destructive" },
  { pattern: /irreversible/i, confirmationClass: "irreversible" },
  { pattern: /public[- ]posting|posts?\s+public/i, confirmationClass: "public-posting" },
  { pattern: /purchase|payment/i, confirmationClass: "purchase" },
  { pattern: /publish/i, confirmationClass: "publishing" },
  { pattern: /billing|charge/i, confirmationClass: "billing" },
  { pattern: /permission|grant-change/i, confirmationClass: "permission-change" },
];

/**
 * Grant-expansion directive patterns screened in action payloads
 * (P9-21): instructions inside app-influenced content can never
 * expand permissions. A heuristic, fail-closed screen — refusing a
 * suspicious payload is always safe; the detail says why.
 */
const INJECTION_DIRECTIVES: readonly RegExp[] = [
  /\bgrant\b[^.]{0,40}\b(capability|permission|control|access)/i,
  /\b(expand|widen|broaden)\b[^.]{0,40}\b(permission|grant|scope)/i,
  /\bbypass\b[^.]{0,40}\b(policy|revocation|sandbox|check)/i,
  /\bignore\b[^.]{0,40}\b(policy|revocation|expiry|denial)/i,
  /\bextend\b[^.]{0,40}\b(expiry|grant|expiration)/i,
  /\badd\b[^.]{0,40}\bcapability[- ]class/i,
];

function refused(
  reason: Extract<ApplicationActionAdmissionResult, { admitted: false }>["reason"],
  detail: string,
): ApplicationActionAdmissionResult {
  return { admitted: false, reason, detail };
}

/**
 * Run the ladder for one (session, capabilityId) pair. Pure and
 * deterministic: identical inputs walk identical steps in identical
 * order (tested by order pinning).
 */
export function admitApplicationAction(
  context: ApplicationAdmissionContext,
  capabilityId: string,
  payloadText: string | null,
): ApplicationActionAdmissionResult {
  const { descriptor, attachment, session, sandbox, now } = context;

  // 1. Grant state first — the security fact dominates.
  const status = attachmentStatus(attachment, now);
  if (!status.active && status.reason === "revoked") {
    return refused(
      "attachment-revoked",
      `attachment ${attachment.attachmentId} was revoked at ${attachment.revokedAt} — new actions are blocked and active mutations safe-stop (P9-20)`,
    );
  }
  if (!status.active && status.reason === "expired") {
    return refused(
      "attachment-expired",
      `attachment ${attachment.attachmentId} expired at ${attachment.expiresAt} (checked at ${now} — expiry is clock-evaluated, never record-trusted)`,
    );
  }

  // 2. The descriptor catalog is authoritative.
  const capability = descriptor.capabilities.find(
    (candidate) => candidate.capabilityId === capabilityId,
  );
  if (capability === undefined) {
    return refused(
      "capability-not-declared",
      `capability "${capabilityId}" is not declared by ${descriptor.applicationId}@${descriptor.appVersion} — undeclared actions are never admitted`,
    );
  }

  // 3. Set membership: granting one class never grants another (lock 30).
  if (!isCapabilityClassGranted(attachment, capability.capabilityClass)) {
    return refused(
      "capability-class-not-granted",
      `capability class "${capability.capabilityClass}" was never granted by the user (granted: ${attachment.grantedCapabilityClasses.join(", ") || "none"}) — observation does not imply mutation`,
    );
  }

  // 4. Bounded session law.
  if (session.closeState !== "active") {
    return refused(
      "session-closed",
      `session ${session.sessionId} is ${session.closeState} — a disconnected or closed session never admits actions`,
    );
  }

  // 5. Sandbox policy: declared permissions vs the environment, plus
  //    the network-consistency law (a network capability on an app
  //    that declares no network needs is fail-closed).
  const deniedPermission = capability.requiredPermissions.find((permission) =>
    sandbox.deniedPermissions.includes(permission),
  );
  if (deniedPermission !== undefined) {
    return refused(
      "sandbox-policy-denied",
      `capability "${capabilityId}" requires permission "${deniedPermission}" which the sandbox policy denies`,
    );
  }
  if (capability.capabilityClass === "network-access" && descriptor.networkNeeds === "none") {
    return refused(
      "sandbox-policy-denied",
      `capability "${capabilityId}" is network-class but ${descriptor.applicationId} declares networkNeeds "none" — inconsistent declarations are fail-closed`,
    );
  }

  // 6. Instruction-injection screen over the payload (P9-21).
  if (payloadText !== null && payloadText.length > 0) {
    const directive = INJECTION_DIRECTIVES.find((pattern) => pattern.test(payloadText));
    if (directive !== undefined) {
      return refused(
        "instruction-injection-suspected",
        `payload matches a grant-expansion directive (${directive.source}) — instructions inside app content can never expand permissions (P9-21)`,
      );
    }
  }

  // Admitted. High-impact mutating capabilities require confirmation.
  const confirmation = requiredConfirmationClass(capability);
  if (confirmation === null) {
    return { admitted: true, capabilityId, requiresConfirmation: false };
  }
  return {
    admitted: true,
    capabilityId,
    requiresConfirmation: true,
    confirmationClass: confirmation,
  };
}

/** Map declared side effects to the confirmation class (observe is pure). */
export function requiredConfirmationClass(
  capability: ApplicationCapability,
): Extract<ApplicationActionAdmissionResult, { admitted: true; requiresConfirmation: true }>["confirmationClass"] | null {
  if (capability.capabilityClass === "observe") return null;
  for (const sideEffect of capability.sideEffects) {
    for (const highImpact of HIGH_IMPACT_SIDE_EFFECTS) {
      if (highImpact.pattern.test(sideEffect)) return highImpact.confirmationClass;
    }
  }
  return null;
}
