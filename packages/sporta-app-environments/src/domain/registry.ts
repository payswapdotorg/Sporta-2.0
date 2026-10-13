/**
 * Descriptor registry laws (domain — pure, W9C-1).
 *
 * Well-formedness of ApplicationEnvironmentDescriptor records and the
 * capability-catalog stability law: a re-registered descriptor for the
 * SAME (applicationId, appVersion, targetIdentity) with a DIFFERENT
 * capability catalog is a typed error — broader permissions on a new
 * release require a new version and reauthorization (security law 3).
 */
import type {
  ApplicationCapability,
  ApplicationCapabilityClass,
  ApplicationEnvironmentDescriptor,
} from "@sporta/app-environments/contract";
import { ApplicationRegistryError } from "./errors.js";

/** The frozen capability-class vocabulary. */
export const APPLICATION_CAPABILITY_CLASSES: readonly ApplicationCapabilityClass[] = [
  "observe",
  "control",
  "semantic-binding",
  "file-transfer",
  "network-access",
];

const VALID_TARGET_KINDS = new Set([
  "local",
  "remote",
  "browser-hosted",
  "native",
  "service",
]);

const VALID_HEALTH = new Set(["healthy", "degraded", "unreachable"]);

/** Classes the descriptor's capabilities actually declare. */
export function declaredCapabilityClasses(
  descriptor: Pick<ApplicationEnvironmentDescriptor, "capabilities">,
): readonly ApplicationCapabilityClass[] {
  const classes = new Set<ApplicationCapabilityClass>();
  for (const capability of descriptor.capabilities) classes.add(capability.capabilityClass);
  return [...classes];
}

/**
 * Validate one descriptor (fail-closed). Returns typed violations; an
 * empty list means well-formed. Pure — no IO, no clock.
 */
export function validateApplicationDescriptor(
  descriptor: ApplicationEnvironmentDescriptor,
): readonly string[] {
  const violations: string[] = [];
  if (descriptor.descriptorId.length === 0) violations.push("descriptorId must be non-empty");
  if (descriptor.applicationId.length === 0) violations.push("applicationId must be non-empty");
  if (descriptor.providerAdapterId.length === 0) violations.push("providerAdapterId must be non-empty");
  if (descriptor.appVersion.length === 0) violations.push("appVersion must be non-empty");
  if (descriptor.targetIdentity.length === 0) violations.push("targetIdentity must be non-empty");
  if (!VALID_TARGET_KINDS.has(descriptor.targetKind)) {
    violations.push(`targetKind "${descriptor.targetKind}" is not in the frozen vocabulary`);
  }
  if (descriptor.workspaceBinding.tenant.length === 0) violations.push("workspace tenant must be non-empty");
  if (descriptor.workspaceBinding.workspace.length === 0) violations.push("workspace must be non-empty");
  if (descriptor.capabilities.length === 0) violations.push("at least one capability must be declared");
  const seenCapabilityIds = new Set<string>();
  for (const capability of descriptor.capabilities) {
    validateCapability(capability, violations, seenCapabilityIds);
  }
  if (descriptor.networkNeeds !== "none" && descriptor.networkNeeds !== "narrow-allowlist") {
    violations.push(`networkNeeds "${descriptor.networkNeeds}" is not in the frozen vocabulary`);
  }
  if (!VALID_HEALTH.has(descriptor.health.status)) {
    violations.push(`health.status "${descriptor.health.status}" is not in the frozen vocabulary`);
  }
  if (descriptor.health.checkedAt.length === 0) violations.push("health.checkedAt must be non-empty");
  if (descriptor.licensing.license.length === 0) violations.push("license must be non-empty");
  if (descriptor.dataClasses.length === 0) violations.push("dataClasses must declare the data scope");
  return violations;
}

function validateCapability(
  capability: ApplicationCapability,
  violations: string[],
  seenCapabilityIds: Set<string>,
): void {
  if (capability.capabilityId.length === 0) violations.push("capabilityId must be non-empty");
  if (seenCapabilityIds.has(capability.capabilityId)) {
    violations.push(`capabilityId "${capability.capabilityId}" is duplicated in the catalog`);
  }
  seenCapabilityIds.add(capability.capabilityId);
  if (!APPLICATION_CAPABILITY_CLASSES.includes(capability.capabilityClass)) {
    violations.push(`capability ${capability.capabilityId} has unknown class "${capability.capabilityClass}"`);
  }
  if (capability.action.length === 0) {
    violations.push(`capability ${capability.capabilityId} must declare an action name`);
  }
  if (capability.outputs.length === 0) {
    violations.push(`capability ${capability.capabilityId} must declare at least one output`);
  }
}

/** Descriptor identity triple (catalog stability is per identity). */
export function descriptorIdentity(
  descriptor: Pick<
    ApplicationEnvironmentDescriptor,
    "applicationId" | "appVersion" | "targetIdentity"
  >,
): string {
  return `${descriptor.applicationId}@${descriptor.appVersion}@${descriptor.targetIdentity}`;
}

/**
 * The catalog-stability law: re-registering the same identity with a
 * different capability catalog is a typed registry error (broader
 * permissions require a new release + reauthorization). Same catalog
 * (by stable id/class/action set) re-registering is idempotent-OK.
 */
export function assertCatalogStable(
  existing: ApplicationEnvironmentDescriptor,
  incoming: ApplicationEnvironmentDescriptor,
): void {
  if (descriptorIdentity(existing) !== descriptorIdentity(incoming)) return;
  const catalogOf = (descriptor: ApplicationEnvironmentDescriptor): string =>
    descriptor.capabilities
      .map((capability) => `${capability.capabilityId}:${capability.capabilityClass}:${capability.action}`)
      .sort()
      .join("|");
  if (catalogOf(existing) !== catalogOf(incoming)) {
    throw new ApplicationRegistryError(
      `descriptor ${descriptorIdentity(incoming)} re-registered with a DIFFERENT capability catalog — a broader or changed catalog requires a new app version and user reauthorization (security law 3)`,
      "capability-catalog-changed",
    );
  }
}
