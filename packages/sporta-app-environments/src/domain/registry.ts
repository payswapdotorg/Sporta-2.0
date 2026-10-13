/**
 * W9C-1 — descriptor + capability catalog validation (domain — pure,
 * P9-18). Fail-closed law: every violation is a typed entry in a
 * deterministic order (the w9a graph validator idiom). No IO, no
 * node: imports — a pure function of the descriptor record.
 */
import type {
  ApplicationCapability,
  ApplicationCapabilityClass,
  ApplicationEnvironmentDescriptor,
} from "@sporta/app-environments/contract";

/** Typed validation outcome (fail-closed, all violations reported). */
export type ApplicationDescriptorValidation =
  | { valid: true; capabilityCount: number }
  | {
      valid: false;
      violations: readonly { kind: string; detail: string }[];
    };

const CAPABILITY_CLASSES: readonly ApplicationCapabilityClass[] = [
  "observe",
  "control",
  "semantic-binding",
  "file-transfer",
  "network-access",
];

const TARGET_KINDS: readonly string[] = [
  "local",
  "remote",
  "browser-hosted",
  "native",
  "service",
];

const HEALTH_STATUSES: readonly string[] = ["healthy", "degraded", "unreachable"];

const VIOLATION_ORDER: readonly string[] = [
  "missing-field",
  "duplicate-capability",
  "capability-shape",
  "unknown-class",
  "target-kind",
  "network-needs",
  "health",
  "licensing",
  "policy",
];

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;

function violation(kind: string, detail: string): { kind: string; detail: string } {
  return { kind, detail };
}

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0;

const isStringArray = (value: unknown): value is readonly string[] =>
  Array.isArray(value) && value.every((item) => typeof item === "string");

/**
 * Validate one `ApplicationEnvironmentDescriptor`. Checks (deterministic
 * order): required identity/binding fields, unique capability ids,
 * well-formed capability inputs/outputs/sideEffects/failures/permissions,
 * known capability classes, known target kind, network needs shape, health
 * shape, licensing presence, and policy shape. Observation-only
 * capabilities are checked for EMPTY side effects (an observe capability
 * declaring mutation is a shape violation — observation never implies
 * mutation, lock 30).
 */
export function validateApplicationEnvironmentDescriptor(
  descriptor: ApplicationEnvironmentDescriptor,
): ApplicationDescriptorValidation {
  const violations: { kind: string; detail: string }[] = [];

  for (const field of ["descriptorId", "applicationId", "providerAdapterId", "appVersion", "targetIdentity"] as const) {
    if (!isNonEmptyString(descriptor[field])) {
      violations.push(violation("missing-field", `${field} must be a non-empty string`));
    }
  }
  if (descriptor.workspaceBinding === null || typeof descriptor.workspaceBinding !== "object") {
    violations.push(violation("missing-field", "workspaceBinding must be an object"));
  } else if (!isNonEmptyString(descriptor.workspaceBinding.tenant) || !isNonEmptyString(descriptor.workspaceBinding.workspace)) {
    violations.push(violation("missing-field", "workspaceBinding.tenant/workspace must be non-empty"));
  }
  if (!Array.isArray(descriptor.capabilities) || descriptor.capabilities.length === 0) {
    violations.push(violation("missing-field", "capabilities must be a non-empty array"));
    return finish(violations);
  }

  const seen = new Map<string, number>();
  for (const capability of descriptor.capabilities) {
    const count = seen.get(capability.capabilityId) ?? 0;
    seen.set(capability.capabilityId, count + 1);
  }
  for (const [capabilityId, count] of seen) {
    if (count > 1) {
      violations.push(violation("duplicate-capability", `capabilityId ${capabilityId} declared ${count} times`));
    }
  }

  for (const capability of descriptor.capabilities) {
    violations.push(...checkCapability(capability));
  }

  if (!TARGET_KINDS.includes(descriptor.targetKind)) {
    violations.push(violation("target-kind", `targetKind "${String(descriptor.targetKind)}" is not one of ${TARGET_KINDS.join("|")}`));
  }
  if (descriptor.networkNeeds !== "none" && descriptor.networkNeeds !== "narrow-allowlist") {
    violations.push(violation("network-needs", `networkNeeds "${String(descriptor.networkNeeds)}" must be none|narrow-allowlist`));
  }
  if (
    descriptor.health === null ||
    typeof descriptor.health !== "object" ||
    !HEALTH_STATUSES.includes(descriptor.health.status) ||
    typeof descriptor.health.checkedAt !== "string" ||
    !ISO_DATE_PATTERN.test(descriptor.health.checkedAt)
  ) {
    violations.push(violation("health", "health must be {checkedAt: ISO-8601, status: healthy|degraded|unreachable}"));
  }
  if (
    descriptor.licensing === null ||
    typeof descriptor.licensing !== "object" ||
    !isNonEmptyString(descriptor.licensing.license)
  ) {
    violations.push(violation("licensing", "licensing.license must be a non-empty string"));
  }
  for (const field of ["launchRequirements", "dataClasses", "limitations"] as const) {
    if (!isStringArray(descriptor[field])) {
      violations.push(violation("missing-field", `${field} must be an array of strings`));
    }
  }
  if (descriptor.policy === null || typeof descriptor.policy !== "object") {
    violations.push(violation("policy", "policy must be a PolicySet object"));
  } else if (
    descriptor.policy.rights === undefined ||
    descriptor.policy.privacy === undefined ||
    descriptor.policy.retention === undefined
  ) {
    violations.push(violation("policy", "policy must carry rights/privacy/retention scopes"));
  }

  return finish(violations, descriptor.capabilities.length);
}

/** One capability's shape: ports, effects, permissions, failures, class. */
function checkCapability(capability: ApplicationCapability): { kind: string; detail: string }[] {
  const violations: { kind: string; detail: string }[] = [];
  const id = isNonEmptyString(capability.capabilityId) ? capability.capabilityId : "<missing-id>";
  if (!isNonEmptyString(capability.capabilityId) || !isNonEmptyString(capability.action)) {
    violations.push(violation("capability-shape", `capability ${id}: capabilityId and action must be non-empty strings`));
  }
  if (!CAPABILITY_CLASSES.includes(capability.capabilityClass)) {
    violations.push(violation("unknown-class", `capability ${id}: class "${String(capability.capabilityClass)}" is not one of ${CAPABILITY_CLASSES.join("|")}`));
  }
  for (const port of [...capability.inputs, ...capability.outputs]) {
    if (!isNonEmptyString(port.name) || !isNonEmptyString(port.dataKind)) {
      violations.push(violation("capability-shape", `capability ${id}: port names and dataKinds must be non-empty strings`));
    }
  }
  if (!isStringArray(capability.sideEffects) || !isStringArray(capability.requiredPermissions) || !isStringArray(capability.failures)) {
    violations.push(violation("capability-shape", `capability ${id}: sideEffects/requiredPermissions/failures must be string arrays`));
  }
  if (capability.capabilityClass === "observe" && capability.sideEffects.length > 0) {
    violations.push(violation("capability-shape", `capability ${id}: observe capabilities declare no side effects (observation never implies mutation, lock 30)`));
  }
  return violations;
}

function finish(
  violations: { kind: string; detail: string }[],
  capabilityCount = 0,
): ApplicationDescriptorValidation {
  if (violations.length === 0) return { valid: true, capabilityCount };
  const rank = new Map(VIOLATION_ORDER.map((kind, index) => [kind, index]));
  return {
    valid: false,
    violations: [...violations].sort((left, right) => {
      const delta = (rank.get(left.kind) ?? 0) - (rank.get(right.kind) ?? 0);
      return delta !== 0 ? delta : left.detail < right.detail ? -1 : left.detail > right.detail ? 1 : 0;
    }),
  };
}
