/**
 * W9C-3 — deterministic application-action admission (domain — pure,
 * P9-18/21). The ladder is FIXED and total: every request is evaluated in
 * the same order, the FIRST failing step decides, and every refusal is a
 * typed frozen reason with an honest detail. Fail-closed: an unknown
 * descriptor/attachment/session shape is the first-step refusal, never a
 * silent pass. No IO, no node: imports, no ambient time.
 */
import type { Iso8601 } from "@sporta/contracts/contract";
import type {
  ApplicationActionAdmissionResult,
  ApplicationAttachment,
  ApplicationCapability,
  ApplicationCapabilityClass,
  ApplicationEnvironmentDescriptor,
  ApplicationSession,
} from "@sporta/app-environments/contract";

/** One action request submitted for admission. */
export interface ApplicationActionRequest {
  sessionId: string;
  capabilityId: string;
  /** The class the caller believes it is exercising (checked against the declaration). */
  capabilityClass: ApplicationCapabilityClass;
  actor: string;
  /** Sanitized input references (never raw payloads). */
  inputRefs: readonly string[];
  /** Optional action payload (checked for instruction injection). */
  payload?: string | null;
}

/** Session-scoped permission grants supplied by the ZCode permission boundary. */
export interface ApplicationSandboxScope {
  /** Permissions the session holds (e.g. from the tool/permission boundary). */
  grantedPermissions: readonly string[];
  /** Explicit network allowance; default-deny when false. */
  networkAllowed: boolean;
}

/**
 * Side-effect markers → the frozen confirmation classes (deterministic
 * first-match priority: destructive > irreversible > public-posting >
 * purchase > publishing > billing > permission-change).
 */
export const CONFIRMATION_CLASS_BY_SIDE_EFFECT: readonly {
  marker: string;
  confirmationClass: Exclude<
    Extract<ApplicationActionAdmissionResult, { admitted: true; requiresConfirmation: true }>["confirmationClass"],
    never
  >;
}[] = [
  { marker: "destructive", confirmationClass: "destructive" },
  { marker: "irreversible", confirmationClass: "irreversible" },
  { marker: "public", confirmationClass: "public-posting" },
  { marker: "posting", confirmationClass: "public-posting" },
  { marker: "purchase", confirmationClass: "purchase" },
  { marker: "publish", confirmationClass: "publishing" },
  { marker: "billing", confirmationClass: "billing" },
  { marker: "charge", confirmationClass: "billing" },
  { marker: "permission", confirmationClass: "permission-change" },
];

/** Fixed instruction-injection markers (app content never expands permissions). */
const INJECTION_MARKERS: readonly string[] = [
  "grant ",
  "grant:",
  "expand permission",
  "ignore previous",
  "you are now",
  "bypass",
  "escalate privilege",
  "disable sandbox",
  "new instructions:",
];

/**
 * The deterministic admission ladder (SPEC W9C-3). Order:
 * 1 capability-not-declared → 2 capability-class-not-granted →
 * 3 attachment-revoked → 4 attachment-expired → 5 session-closed →
 * 6 sandbox-policy-denied → 7 instruction-injection-suspected →
 * admitted (with the confirmation class when side effects require it).
 */
export function admitApplicationAction(input: {
  descriptor: ApplicationEnvironmentDescriptor | null;
  attachment: ApplicationAttachment | null;
  session: ApplicationSession | null;
  request: ApplicationActionRequest;
  sandbox: ApplicationSandboxScope;
  now: Iso8601;
}): ApplicationActionAdmissionResult {
  const { descriptor, attachment, session, request, sandbox, now } = input;

  // Step 1 — the capability must be declared by the descriptor.
  const capability: ApplicationCapability | undefined = descriptor?.capabilities.find(
    (candidate) => candidate.capabilityId === request.capabilityId,
  );
  if (descriptor === null || capability === undefined) {
    return denied(
      "capability-not-declared",
      `no capability ${request.capabilityId} is declared by the attached application's descriptor`,
    );
  }
  if (capability.capabilityClass !== request.capabilityClass) {
    return denied(
      "capability-not-declared",
      `capability ${request.capabilityId} is declared as class "${capability.capabilityClass}", not "${request.capabilityClass}"`,
    );
  }

  // Step 2 — the requested class must be in the attachment's granted set
  // (granting observe never grants control — lock 30).
  if (attachment === null || !attachment.grantedCapabilityClasses.includes(request.capabilityClass)) {
    return denied(
      "capability-class-not-granted",
      `capability class ${request.capabilityClass} was never granted by the user${
        attachment === null ? " (no attachment on record)" : " — observation does not imply mutation"
      }`,
    );
  }

  // Step 3 — revocation blocks new actions (P9-20).
  if (attachment.revokedAt !== null) {
    return denied(
      "attachment-revoked",
      `attachment ${attachment.attachmentId} was revoked at ${attachment.revokedAt} — new actions are blocked`,
    );
  }

  // Step 4 — expiry is a live clock check.
  if (now >= attachment.expiresAt) {
    return denied(
      "attachment-expired",
      `attachment ${attachment.attachmentId} expired at ${attachment.expiresAt} (checked at ${now})`,
    );
  }

  // Step 5 — only ACTIVE sessions admit actions.
  if (session === null || session.sessionId !== request.sessionId) {
    return denied("session-closed", `no active session ${request.sessionId} on record`);
  }
  if (session.closeState !== "active") {
    return denied(
      "session-closed",
      `session ${session.sessionId} is ${session.closeState} — only active sessions admit actions`,
    );
  }

  // Step 6 — sandbox policy: declared permissions must be covered; network
  // needs are default-deny (lock 32).
  const uncovered = capability.requiredPermissions.filter(
    (permission) => !sandbox.grantedPermissions.includes(permission),
  );
  if (uncovered.length > 0) {
    return denied(
      "sandbox-policy-denied",
      `capability ${request.capabilityId} requires permissions not granted to this session: ${uncovered.join(", ")}`,
    );
  }
  if (descriptor.networkNeeds === "narrow-allowlist" && !sandbox.networkAllowed) {
    return denied(
      "sandbox-policy-denied",
      `descriptor declares narrow-allowlist network needs but the session carries no explicit network allowance (default-deny)`,
    );
  }

  // Step 7 — instruction-injection screening over payload + refs.
  const haystacks = [request.payload ?? "", ...request.inputRefs];
  for (const haystack of haystacks) {
    const lowered = haystack.toLowerCase();
    const marker = INJECTION_MARKERS.find((candidate) => lowered.includes(candidate));
    if (marker !== undefined) {
      return denied(
        "instruction-injection-suspected",
        `action content contains the permission-expansion marker "${marker}" — instructions inside app content can never expand permissions (P9-21)`,
      );
    }
  }

  // Admitted — confirmation class when the declared side effects demand it.
  for (const { marker, confirmationClass } of CONFIRMATION_CLASS_BY_SIDE_EFFECT) {
    if (capability.sideEffects.some((effect) => effect.toLowerCase().includes(marker))) {
      return { admitted: true, capabilityId: request.capabilityId, requiresConfirmation: true, confirmationClass };
    }
  }
  return { admitted: true, capabilityId: request.capabilityId, requiresConfirmation: false };
}

function denied(
  reason: Extract<ApplicationActionAdmissionResult, { admitted: false }>["reason"],
  detail: string,
): ApplicationActionAdmissionResult {
  return { admitted: false, reason, detail };
}

/**
 * Map a frozen refusal reason onto the frozen audit
 * `permissionDecision.basis` vocabulary (the precise reason stays in the
 * record's detail — the basis is the coarse consent-state class).
 */
export function admissionBasisFor(
  result: ApplicationActionAdmissionResult,
): "granted-scope" | "not-granted" | "revoked" | "expired" | "requires-confirmation" {
  if (result.admitted) {
    return result.requiresConfirmation ? "requires-confirmation" : "granted-scope";
  }
  switch (result.reason) {
    case "attachment-revoked":
      return "revoked";
    case "attachment-expired":
      return "expired";
    default:
      return "not-granted";
  }
}
